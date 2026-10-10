import { afterEach, describe, expect, it, vi } from "vitest";
import { gnaniClient } from "../src/clients/gnani";

const KEY = "test-gnani-key";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: () => Response): Array<{ url: string; init: RequestInit }> {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return response();
  });
  return sent;
}

describe("gnaniClient", () => {
  it("TTS posts the timbre-v2.5 body for mp3 at 48 kHz with the X-API-Key-ID header", async () => {
    const sent = stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const audio = await gnaniClient({ apiKey: KEY }).tts({ text: "ನಮಸ್ಕಾರ", voice: "Girish", language: "kn-IN" });
    expect([...audio]).toEqual([1, 2, 3]);
    expect(sent[0].url).toBe("https://api.vachana.ai/api/v1/tts/inference");
    expect(sent[0].init.headers).toMatchObject({ "X-API-Key-ID": KEY, "Content-Type": "application/json" });
    expect(JSON.parse(String(sent[0].init.body))).toEqual({
      text: "ನಮಸ್ಕಾರ",
      model: "timbre-v2.5",
      voice: "Girish",
      language: "kn-IN",
      speed: 1.0,
      audio_config: { sample_rate: 48000, num_channels: 1, container: "mp3" },
    });
  });

  it("STT posts multipart audio_file, language_code and format=transcribe", async () => {
    const sent = stubFetch(() => Response.json({ transcript: "ಈ ಫೋರ್ಟ್ ಯಾಕೆ ಫೇಮಸ್" }));
    const out = await gnaniClient({ apiKey: KEY }).stt({ audio: Buffer.from("abc"), filename: "q.m4a", mimeType: "audio/mp4", languageCode: "kn-IN" });
    expect(out).toEqual({ transcript: "ಈ ಫೋರ್ಟ್ ಯಾಕೆ ಫೇಮಸ್" });
    expect(sent[0].url).toBe("https://api.vachana.ai/stt/v3");
    expect(sent[0].init.headers).toEqual({ "X-API-Key-ID": KEY });
    const form = sent[0].init.body as FormData;
    expect(form.get("language_code")).toBe("kn-IN");
    expect(form.get("format")).toBe("transcribe");
    const file = form.get("audio_file") as File;
    expect(file.name).toBe("q.m4a");
    expect(file.type).toBe("audio/mp4");
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("abc");
  });

  it("turns error JSON into a typed, retryable-on-5xx/429 error without the key", async () => {
    stubFetch(() => Response.json({ success: false, error: { type: "RATE_LIMITED", message: "Only 1 active request is allowed at a time" } }, { status: 429 }));
    const err = await gnaniClient({ apiKey: KEY }).tts({ text: "x", voice: "Girish", language: "en-IN" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ service: "gnani", status: 429, retryable: true });
    expect((err as Error).message).toContain("Only 1 active request");
    expect((err as Error).message).not.toContain(KEY);

    stubFetch(() => Response.json({ message: "Invalid voice" }, { status: 400 }));
    await expect(gnaniClient({ apiKey: KEY }).tts({ text: "x", voice: "Nope", language: "en-IN" }))
      .rejects.toMatchObject({ status: 400, retryable: false, message: expect.stringContaining("Invalid voice") });
  });

  it("reports a network failure or timeout as a retryable error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(gnaniClient({ apiKey: KEY }).tts({ text: "x", voice: "Girish", language: "en-IN" }))
      .rejects.toMatchObject({ service: "gnani", status: null, retryable: true, message: "gnani timed out" });
  });

  it("rejects an STT answer without a transcript", async () => {
    stubFetch(() => Response.json({ text: "?" }));
    await expect(gnaniClient({ apiKey: KEY }).stt({ audio: Buffer.from("a"), filename: "q.m4a", mimeType: "audio/mp4", languageCode: "en-IN" }))
      .rejects.toMatchObject({ service: "gnani", retryable: false });
  });
});
