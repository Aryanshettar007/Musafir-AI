import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { LanguageId } from "../catalog/languages";
import { createLimiter } from "./limiter";
import { UpstreamError, withRetry } from "./upstream";

// Gemini runs on Vertex AI (paid, billed to the Google Cloud project, authenticated with Application Default
// Credentials; the org policy disallows API keys). Flash-lite first, flash when lite fails or for flash-only languages.
export const GEMINI_LITE = "gemini-3.5-flash-lite";
export const GEMINI_FLASH = "gemini-3.8-flash";

export interface GenerateJsonRequest<T> {
  purpose: string; // for logs: "curate", "story", "ask", "sponsor-ad"
  system: string;
  prompt: string;
  schema: z.ZodType<T>; // sent as responseJsonSchema (z.toJSONSchema) and validated with zod
  language?: LanguageId; // routes to flash directly when listed in GEMINI_FLASH_LANGUAGES
  validate?: (value: T) => string[]; // extra checks (e.g. script check); returns problems, [] = OK
  // Fail fast for interactive callers: a retryable failure whose requested wait exceeds this is not retried on the same
  // model (the call moves on to the next attempt/model instead of sleeping). Default: wait as long as asked.
  maxRetryDelayMs?: number;
  // "interactive" (live questions) jumps ahead of queued background work (trip stories). Default: "background".
  priority?: "interactive" | "background";
}

export interface GeminiClient {
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<{ value: T; model: string; attempts: number }>;
}

export interface GeminiConfig {
  project: string; // Google Cloud project that is billed
  location: string; // Vertex AI location, e.g. "global"
  concurrency: number;
  flashLanguages: LanguageId[];
}

// One raw call: returns the model's text. Injectable so tests need no network.
export interface GeminiCall {
  model: string;
  system: string;
  prompt: string;
  jsonSchema: unknown;
}
export type GeminiTransport = (call: GeminiCall) => Promise<string>;

export interface GeminiDeps {
  transport?: GeminiTransport;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const TIMEOUT_MS = 60_000;
// Longest upstream-requested wait we sit out.
const MAX_RETRY_DELAY_MS = 120_000;

// The SDK reports 429s as ApiError with Google's JSON in the message, including "retryDelay": "44s".
// Credentials come from Application Default Credentials: `gcloud auth application-default login` locally, the
// service account attached to the service on Cloud Run.
function realTransport(cfg: Pick<GeminiConfig, "project" | "location">): GeminiTransport {
  const client = new GoogleGenAI({ vertexai: true, project: cfg.project, location: cfg.location });
  return async ({ model, system, prompt, jsonSchema }) => {
    try {
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          // flash rejects MINIMAL; LOW works for both models.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          httpOptions: { timeout: TIMEOUT_MS },
        },
      });
      return res.text ?? "";
    } catch (e) {
      throw toUpstreamError(e);
    }
  };
}

export function toUpstreamError(e: unknown): UpstreamError {
  if (e instanceof UpstreamError) return e;
  const message = e instanceof Error ? e.message : String(e);
  const code = /"code":\s*(\d{3})/.exec(message)?.[1];
  const status = e instanceof ApiError ? e.status : code ? Number(code) : null;
  const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(message)?.[1];
  const delayMs = delay ? Math.ceil(Number(delay) * 1000) : undefined;
  const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
  // A daily quota (quota id "...PerDay...") or a wait of minutes won't clear within our retries: fail this model now
  // so the caller moves on to the other model instead of sleeping for hours.
  const exhausted = /PerDay/i.test(message) || (delayMs !== undefined && delayMs > MAX_RETRY_DELAY_MS);
  const transient = timedOut || status === null || status === 429 || (status !== null && status >= 500);
  // Google's message can be long JSON; keep the start for the logs.
  return new UpstreamError("gemini", status, `Gemini call failed${status ? ` (${status})` : ""}: ${message.slice(0, 200)}`,
    transient && !exhausted, delayMs);
}

type Attempt = { model: string };

export function geminiClient(cfg: GeminiConfig, deps: GeminiDeps = {}): GeminiClient {
  const transport = deps.transport ?? realTransport(cfg);
  // One concurrency limit for all calls. Interactive calls (live questions) jump ahead of queued background work.
  const shared = createLimiter({ concurrency: cfg.concurrency });

  // Every transport try (including retries) waits for the model's rate window, then for a shared slot.
  const callModel = (model: string, call: Omit<GeminiCall, "model">, maxRetryDelayMs?: number, interactive = false) => {
    const priority = interactive ? "high" : "normal";
    return withRetry(() => {
      const queuedAt = performance.now();
      return shared.run(async () => {
        const startedAt = performance.now();
        try {
          return await transport({ model, ...call });
        } finally {
          // Tells a slow answer apart: waiting for a concurrency slot (queued) vs. Gemini itself (call).
          const queued = Math.round(startedAt - queuedAt);
          const took = Math.round(performance.now() - startedAt);
          if (queued + took > 3000) console.warn(`[gemini] slow ${model}: queued=${queued}ms call=${took}ms${interactive ? " (interactive)" : ""}`);
        }
      }, { priority });
    }, {
      attempts: 4,
      baseDelayMs: 1000,
      sleep: deps.sleep,
      ...(maxRetryDelayMs !== undefined && {
        isRetryable: (e: unknown) => e instanceof UpstreamError && e.retryable && (e.retryAfterMs ?? 0) <= maxRetryDelayMs,
      }),
    });
  };

  return {
    async generateJson<T>(req: GenerateJsonRequest<T>) {
      const jsonSchema = z.toJSONSchema(req.schema);
      const flashOnly = req.language !== undefined && cfg.flashLanguages.includes(req.language);
      // lite -> lite with the problems -> flash -> lite once more (flash is often overloaded with 503s, and lite's
      // answers are usually only rejected on length/script, so a last lite try with the problems can still pass).
      // Languages routed to flash skip lite first.
      const attempts: Attempt[] = flashOnly
        ? [{ model: GEMINI_FLASH }, { model: GEMINI_FLASH }, { model: GEMINI_LITE }]
        : [{ model: GEMINI_LITE }, { model: GEMINI_LITE }, { model: GEMINI_FLASH }, { model: GEMINI_LITE }];

      let problems: string[] = [];
      let lastFailure = "no attempt was made";
      let made = 0;
      for (let i = 0; i < attempts.length; i++) {
        const { model } = attempts[i];
        const prompt =
          problems.length > 0
            ? `${req.prompt}\n\nYour previous answer had these problems:\n${problems.map((p) => `- ${p}`).join("\n")}\nFix them in your new answer.`
            : req.prompt;
        made++;
        let raw: string;
        try {
          raw = await callModel(model, { system: req.system, prompt, jsonSchema }, req.maxRetryDelayMs, req.priority === "interactive");
        } catch (e) {
          // The model is failing at the transport level even after retries: skip to the next *different* model.
          lastFailure = e instanceof Error ? e.message : String(e);
          console.warn(`[gemini] ${req.purpose}: ${model} failed: ${lastFailure}`);
          const next = attempts.findIndex((a, j) => j > i && a.model !== model);
          if (next === -1) break;
          i = next - 1;
          continue;
        }
        const found = judge(raw, req);
        if (found.value !== undefined) return { value: found.value.v, model, attempts: made };
        problems = found.problems;
        lastFailure = problems.join("; ");
        console.warn(`[gemini] ${req.purpose}: ${model} answer rejected: ${lastFailure}`);
      }
      throw new UpstreamError("gemini", null, `Gemini could not produce a valid ${req.purpose}: ${lastFailure}`, false);
    },
  };
}

// Parse, schema-check and validate one raw answer. The value is boxed so a falsy T still counts as a success.
function judge<T>(raw: string, req: GenerateJsonRequest<T>): { value?: { v: T }; problems: string[] } {
  if (!raw.trim()) return { problems: ["The answer was empty. Reply with the JSON object."] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { problems: ["The answer was not valid JSON. Reply with only the JSON object."] };
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) {
    return { problems: [`The JSON did not match the required schema: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`] };
  }
  const problems = req.validate?.(parsed.data) ?? [];
  return problems.length > 0 ? { problems } : { value: { v: parsed.data }, problems: [] };
}
