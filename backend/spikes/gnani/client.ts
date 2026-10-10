// SPIKE (throwaway): minimal Gnani Vachana client used to probe TTS/STT behaviour.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://api.vachana.ai";
const API_KEY = process.env.GNANI_API_KEY;
if (!API_KEY) throw new Error("GNANI_API_KEY missing from backend/.env");

export const OUT_DIR = path.resolve(__dirname, "../out");

export type TtsLanguage =
  | "auto" | "en-IN" | "hi-IN" | "hi-en" | "kn-IN" | "ta-IN"
  | "te-IN" | "ml-IN" | "mr-IN" | "bn-IN" | "gu-IN" | "pa-IN";

export interface TtsRequest {
  text: string;
  voice: string;
  language: TtsLanguage;
  container?: "wav" | "mp3" | "ogg";
  sampleRate?: number;
  speed?: number;
}

export interface TimedResult<T> {
  ms: number;
  status: number;
  attempts?: number;
  value: T;
}

export async function tts(req: TtsRequest): Promise<TimedResult<Buffer | string>> {
  const container = req.container ?? "mp3";
  const body = {
    text: req.text,
    model: "timbre-v2.5",
    voice: req.voice,
    language: req.language,
    speed: req.speed ?? 1.0,
    audio_config: {
      // mp3 at 24 kHz intermittently 500s on Gnani's side; 48 kHz (the API default) is reliable.
      sample_rate: req.sampleRate ?? 48000,
      num_channels: 1,
      ...(container === "mp3" ? { container, bitrate: "64k" } : { container, encoding: "linear_pcm", sample_width: 2 }),
    },
  };

  const started = performance.now();
  let res!: Response;
  let buf!: Buffer;
  let attempts = 0;
  // Retry 5xx with backoff - Gnani returns transient "technical difficulties" 500s.
  while (attempts < 3) {
    attempts++;
    res = await fetch(`${BASE_URL}/api/v1/tts/inference`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    buf = Buffer.from(await res.arrayBuffer());
    if (res.status < 500) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempts));
  }
  const ms = Math.round(performance.now() - started);

  // Errors come back as JSON; success is raw audio bytes.
  return { ms, status: res.status, attempts, value: res.ok ? buf : buf.toString("utf8") };
}

export async function stt(filePath: string, languageCode: string): Promise<TimedResult<unknown>> {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("audio_file", new Blob([bytes]), path.basename(filePath));
  form.append("language_code", languageCode);
  form.append("format", "transcribe");

  const started = performance.now();
  const res = await fetch(`${BASE_URL}/stt/v3`, {
    method: "POST",
    headers: { "X-API-Key-ID": API_KEY! },
    body: form,
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - started);

  let value: unknown = text;
  try { value = JSON.parse(text); } catch { /* keep raw text */ }
  return { ms, status: res.status, value };
}
