import { readFileSync } from "node:fs";
import path from "node:path";
import type { VerifyIdToken } from "../../src/clients/firebase";
import { GEMINI_LITE, type GeminiClient, type GenerateJsonRequest } from "../../src/clients/gemini";
import type { GnaniPriority, GnaniService } from "../../src/clients/gnaniQueue";
import type { MapsClient } from "../../src/clients/maps";
import type { Storage } from "../../src/clients/storage";
import { UpstreamError } from "../../src/clients/upstream";

// Fake token verifier: the token is "uid:<uid>". Real tokens are checked by firebase-admin in production.
export const fakeVerifyIdToken: VerifyIdToken = async (token) => {
  if (!token.startsWith("uid:")) throw new Error("bad token");
  const uid = token.slice(4);
  return { uid, email: `${uid}@example.com` };
};

export const authHeader = (uid: string) => ({ Authorization: `Bearer uid:${uid}` });

export interface MemoryStorage extends Storage {
  puts: Array<{ key: string; bytes: number; contentType: string }>;
  files: Map<string, Buffer>;
}

// Records every put and signs URLs like https://cdn.example/<key>?sig=test.
export function memoryStorage(): MemoryStorage {
  const puts: MemoryStorage["puts"] = [];
  const files = new Map<string, Buffer>();
  return {
    puts,
    files,
    async put(key, body, contentType) {
      puts.push({ key, bytes: body.length, contentType });
      files.set(key, body);
    },
    async url(key) {
      return `https://cdn.example/${key}?sig=test`;
    },
  };
}

// A real ~4 second mp3 (a Gnani voice demo), so durations parse in tests.
export const SHORT_MP3 = readFileSync(path.join(__dirname, "../fixtures/short.mp3"));

type Scripted<T> = T | Error | ((req: GenerateJsonRequest<T>) => T | Error);

export interface FakeGemini extends GeminiClient {
  calls: Array<GenerateJsonRequest<unknown>>;
}

// Scripted Gemini: a queue of answers (a value, an Error to throw, or a function of the request), or one function
// used for every call. Answers go through the request's schema and `validate`, like the real client.
export function fakeGemini(script: Array<Scripted<unknown>> | ((req: GenerateJsonRequest<unknown>) => unknown)): FakeGemini {
  const queue = Array.isArray(script) ? [...script] : undefined;
  const calls: FakeGemini["calls"] = [];
  return {
    calls,
    async generateJson<T>(req: GenerateJsonRequest<T>) {
      calls.push(req as GenerateJsonRequest<unknown>);
      const next = queue ? queue.shift() : script;
      if (next === undefined && queue) throw new Error(`fakeGemini: no scripted answer left for "${req.purpose}"`);
      const answer = typeof next === "function" ? (next as (r: GenerateJsonRequest<T>) => unknown)(req) : next;
      if (answer instanceof Error) throw answer;
      const value = req.schema.parse(answer);
      const problems = req.validate?.(value) ?? [];
      if (problems.length > 0) throw new UpstreamError("gemini", null, `invalid: ${problems.join("; ")}`, false);
      return { value, model: GEMINI_LITE, attempts: 1 };
    },
  };
}

export interface FakeGnani extends GnaniService {
  calls: Array<{ kind: "tts" | "stt"; priority: GnaniPriority; text?: string; voice?: string; language?: string }>;
}

// Fake Gnani: every TTS call returns the short mp3 fixture; STT returns `transcript`.
export function fakeGnani(opts: { transcript?: string } = {}): FakeGnani {
  const calls: FakeGnani["calls"] = [];
  return {
    calls,
    async tts(req, { priority }) {
      calls.push({ kind: "tts", priority, text: req.text, voice: req.voice, language: req.language });
      return Buffer.from(SHORT_MP3);
    },
    async stt(_req, { priority }) {
      calls.push({ kind: "stt", priority });
      return { transcript: opts.transcript ?? "fake transcript" };
    },
    async voiceCloneEmbeddings(_req, _opts) {
      return {
        embedding: "fake-base64-embedding",
        shape: [1, 768],
        dtype: "torch.bfloat16",
      };
    },
  };
}

// Fake Maps: no results by default; override the methods a test cares about.
export function fakeMaps(overrides: Partial<MapsClient> = {}): MapsClient {
  return {
    computeRoute: async () => null,
    computeRoutes: async (req) => {
      if (overrides.computeRoute) {
        const r = await overrides.computeRoute(req);
        return r ? [{ id: "route_0", ...r, description: "Fastest route" }] : [];
      }
      return [];
    },
    searchNearby: async () => [],
    searchText: async () => ({ places: [] }),
    autocomplete: async () => [],
    ...overrides,
  };
}
