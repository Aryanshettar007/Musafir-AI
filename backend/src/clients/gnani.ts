import { z } from "zod";
import type { LanguageId } from "../catalog/languages";
import { asUpstreamError, fetchWithTimeout, isRetryableStatus, parseRetryAfter, UpstreamError } from "./upstream";

const BASE_URL = "https://api.vachana.ai";
const TTS_TIMEOUT_MS = 60_000;
const STT_TIMEOUT_MS = 30_000;

// One attempt per call: retries and the one-request-at-a-time rule belong to the queue (gnaniQueue.ts).
export interface SpeakerEmbedding {
  embedding: string;
  shape: number[];
  dtype: string;
}

export interface GnaniTtsRequest {
  text: string;
  voice?: string;
  language?: LanguageId;
  speakerEmbedding?: SpeakerEmbedding;
}

export interface GnaniClient {
  // mp3, 48 kHz (timbre-v2.5) or 44.1 kHz (vachana-vc-v1). Keep `text` under ~1 800 characters (see speech/chunk.ts).
  tts(req: GnaniTtsRequest): Promise<Buffer>;
  stt(req: { audio: Buffer; filename: string; mimeType: string; languageCode: string }): Promise<{ transcript: string }>;
  voiceCloneEmbeddings(req: { audio: Buffer; filename: string; mimeType: string }): Promise<SpeakerEmbedding>;
}

const SttResponse = z.object({ transcript: z.string() });
const VoiceCloneResponse = z.object({
  data: z.object({
    voice_clone_embedding: z.object({
      embedding: z.string(),
      shape: z.array(z.number()),
      dtype: z.string(),
    }),
  }),
});
// Errors are JSON, either { error: { type, message } } or a flat { message }.
const ErrorBody = z.object({ message: z.string().optional(), error: z.object({ message: z.string().optional() }).optional() });

export function gnaniClient(cfg: { apiKey: string }): GnaniClient {
  const headers = { "X-API-Key-ID": cfg.apiKey };

  async function send(path: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${BASE_URL}${path}`, init);
    } catch (e) {
      throw asUpstreamError("gnani", e);
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const body = ErrorBody.parse(JSON.parse(text));
      detail = body.error?.message ?? body.message ?? detail;
    } catch { /* keep the raw text */ }
    throw new UpstreamError(
      "gnani",
      res.status,
      `Gnani ${path} failed with ${res.status}: ${detail}`,
      isRetryableStatus(res.status),
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }

  return {
    async tts(req) {
      const body = req.speakerEmbedding
        ? {
            text: req.text,
            model: "vachana-vc-v1",
            ...(req.language && { language: req.language }),
            audio_config: { sample_rate: 44100, num_channels: 1, container: "mp3", bitrate: "128k" },
            speaker_embedding: req.speakerEmbedding,
          }
        : {
            text: req.text,
            model: "timbre-v2.5",
            voice: req.voice,
            language: req.language,
            speed: 1.0,
            // mp3 at 24 kHz intermittently 500s on Gnani's side; 48 kHz is reliable. The bitrate field is ignored.
            audio_config: { sample_rate: 48000, num_channels: 1, container: "mp3" },
          };

      const res = await send("/api/v1/tts/inference", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: TTS_TIMEOUT_MS,
      });
      let audio: Buffer;
      try {
        // The timeout also covers the body; an abort mid-download must still be a retryable UpstreamError.
        audio = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        throw asUpstreamError("gnani", e);
      }
      // Errors are JSON with a 4xx/5xx status, so an empty 200 body is the only other failure to guard against.
      if (audio.length === 0) throw new UpstreamError("gnani", res.status, "Gnani TTS returned no audio", true);
      return audio;
    },

    async stt({ audio, filename, mimeType, languageCode }) {
      const form = new FormData();
      form.append("audio_file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
      form.append("language_code", languageCode);
      form.append("format", "transcribe");
      const res = await send("/stt/v3", { method: "POST", headers, body: form, timeoutMs: STT_TIMEOUT_MS });
      let body: string;
      try {
        body = await res.text();
      } catch (e) {
        throw asUpstreamError("gnani", e);
      }
      let json: unknown = null;
      try {
        json = JSON.parse(body);
      } catch { /* reported below as an unexpected response */ }
      const parsed = SttResponse.safeParse(json);
      if (!parsed.success) throw new UpstreamError("gnani", res.status, "Gnani STT returned an unexpected response", false);
      return { transcript: parsed.data.transcript };
    },

    async voiceCloneEmbeddings({ audio, filename, mimeType }) {
      const form = new FormData();
      form.append("audio_file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
      const res = await send("/api/v1/tts/voice-clone/embeddings", {
        method: "POST",
        headers,
        body: form,
        timeoutMs: TTS_TIMEOUT_MS,
      });
      let body: string;
      try {
        body = await res.text();
      } catch (e) {
        throw asUpstreamError("gnani", e);
      }
      let json: unknown = null;
      try {
        json = JSON.parse(body);
      } catch {}
      const parsed = VoiceCloneResponse.safeParse(json);
      if (!parsed.success) {
        throw new UpstreamError("gnani", res.status, "Gnani voice clone returned an unexpected response", false);
      }
      return parsed.data.data.voice_clone_embedding;
    },
  };
}
