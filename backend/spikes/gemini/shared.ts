// SPIKE (throwaway): shared helpers for the Gemini probes.
import "dotenv/config";
import path from "node:path";
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";

if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing from backend/.env");
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const OUT_DIR = path.resolve(__dirname, "../out/gemini");

export const MODELS = {
  flash: "gemini-3.8-flash",
  lite: "gemini-3.5-flash-lite",
  pro: "gemini-3.1-pro-preview",
} as const;

export type LanguageStyle = "en-IN" | "kn-IN" | "kn-mixed" | "hi-IN" | "hi-en";

// How each style should be written so Gnani TTS (see spikes/gnani/FINDINGS.md) reads it well.
export const LANGUAGE_GUIDE: Record<LanguageStyle, { tts: string; voice: string; guide: string }> = {
  "en-IN": { tts: "en-IN", voice: "Kaveri", guide: "Warm Indian English." },
  "kn-IN": {
    tts: "kn-IN",
    voice: "Saanvi",
    guide: "Natural spoken Kannada in Kannada script, the way a Bengaluru radio jockey talks - not bookish or formal.",
  },
  "kn-mixed": {
    tts: "kn-IN",
    voice: "Saanvi",
    guide:
      "Kanglish: everyday Kannada in Kannada script, mixed with common English words (fort, history, famous, " +
      "important, left, right, km) written in Latin script, exactly how young Bengaluru people speak.",
  },
  "hi-IN": { tts: "hi-IN", voice: "Nalini", guide: "Natural spoken Hindi in Devanagari script." },
  "hi-en": {
    tts: "hi-en",
    voice: "Poorvi",
    guide: "Hinglish written fully in Latin script (romanised Hindi mixed with English), casual and friendly.",
  },
};

export const StorySchema = z.object({
  title: z.string().describe("Short title of the place, in the target language"),
  script: z.string().describe("The narration exactly as it should be spoken"),
  estimatedSeconds: z.number().describe("Estimated spoken duration in seconds"),
  factsUsed: z.array(z.string()).describe("Each factual claim in the script, copied from the provided FACTS in English"),
});
export type Story = z.infer<typeof StorySchema>;

export interface CallResult<T> {
  ok: boolean;
  ms: number;
  value?: T;
  raw?: string;
  error?: string;
  tokens?: { input?: number; output?: number; thinking?: number };
}

export async function generateJson<T>(opts: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  thinking?: ThinkingLevel;
}): Promise<CallResult<T>> {
  const config: GenerateContentConfig = {
    systemInstruction: opts.system,
    responseMimeType: "application/json",
    responseJsonSchema: z.toJSONSchema(opts.schema),
    ...(opts.thinking ? { thinkingConfig: { thinkingLevel: opts.thinking } } : {}),
  };

  const started = performance.now();
  try {
    const res = await withRetry(() => ai.models.generateContent({ model: opts.model, contents: opts.prompt, config }));
    const ms = Math.round(performance.now() - started);
    const raw = res.text ?? "";
    const tokens = {
      input: res.usageMetadata?.promptTokenCount,
      output: res.usageMetadata?.candidatesTokenCount,
      thinking: res.usageMetadata?.thoughtsTokenCount,
    };
    const parsed = opts.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ok: false, ms, raw, tokens, error: `schema: ${parsed.error.message}` };
    return { ok: true, ms, value: parsed.data, raw, tokens };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    return { ok: false, ms, error: err instanceof Error ? err.message : String(err) };
  }
}

export let retryCount = 0;

// Gemini returns 503 "high demand" and 429s under load; retry those with exponential backoff.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /"code":\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(msg);
      if (!retryable || i >= attempts) throw err;
      retryCount++;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

// Minimal "RAG" for the spike: pull plain-text facts for a place from Wikipedia.
export async function wikipediaFacts(title: string, maxChars = 5000): Promise<string> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=" +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": "MusafirAI-spike/0.1 (hackathon prototype)" } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data = (await res.json()) as { query: { pages: Record<string, { extract?: string }> } };
  const extract = Object.values(data.query.pages)[0]?.extract ?? "";
  return extract.slice(0, maxChars);
}
