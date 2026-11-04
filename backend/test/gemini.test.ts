import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  GEMINI_FLASH,
  GEMINI_LITE,
  geminiClient,
  toUpstreamError,
  type GeminiCall,
  type GeminiConfig,
  type GeminiTransport,
} from "../src/clients/gemini";
import { UpstreamError } from "../src/clients/upstream";

const Schema = z.object({ title: z.string(), script: z.string() });
const good = JSON.stringify({ title: "Fort", script: "hello" });

const cfg: GeminiConfig = { apiKeys: ["test"], liteRpm: 100, flashRpm: 100, concurrency: 2, flashLanguages: [] };

// A transport that answers from a script (a string, or an Error to throw) and records the calls.
function scripted(answers: Array<string | Error>): { transport: GeminiTransport; calls: GeminiCall[] } {
  const calls: GeminiCall[] = [];
  const queue = [...answers];
  return {
    calls,
    transport: async (call) => {
      calls.push(call);
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted answer left");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const run = (c: GeminiConfig, answers: Array<string | Error>, extra: { validate?: (v: z.infer<typeof Schema>) => string[]; language?: "kn-IN" } = {}) => {
  const { transport, calls } = scripted(answers);
  const client = geminiClient(c, { transport, sleep: async () => {} });
  const result = client.generateJson({ purpose: "test", system: "sys", prompt: "write it", schema: Schema, ...extra });
  return { result, calls };
};

describe("geminiClient.generateJson", () => {
  it("answers from flash-lite on the first try", async () => {
    const { result, calls } = run(cfg, [good]);
    expect(await result).toEqual({ value: { title: "Fort", script: "hello" }, model: GEMINI_LITE, attempts: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].jsonSchema).toMatchObject({ type: "object" });
  });

  it("retries flash-lite with the problems appended, falls back to flash, then tries flash-lite once more", async () => {
    const { result, calls } = run(cfg, [good, good, good, good], { validate: (v) => (v.script === "hello" ? ["Too short."] : []) });
    await expect(result).rejects.toMatchObject({ service: "gemini", retryable: false });
    expect(calls.map((c) => c.model)).toEqual([GEMINI_LITE, GEMINI_LITE, GEMINI_FLASH, GEMINI_LITE]);
    expect(calls[0].prompt).toBe("write it");
    expect(calls[1].prompt).toContain("Your previous answer had these problems:\n- Too short.");
    expect(calls[2].prompt).toContain("- Too short.");
    expect(calls[3].prompt).toContain("- Too short.");
  });

  it("succeeds on the second flash-lite attempt after a validation problem", async () => {
    const better = JSON.stringify({ title: "Fort", script: "a longer script" });
    const { result } = run(cfg, [good, better], { validate: (v) => (v.script === "hello" ? ["Too short."] : []) });
    expect(await result).toMatchObject({ value: { script: "a longer script" }, model: GEMINI_LITE, attempts: 2 });
  });

  it("moves to the next attempt on invalid JSON and on schema failures", async () => {
    const { result, calls } = run(cfg, ["not json", JSON.stringify({ title: 1 }), good]);
    expect(await result).toMatchObject({ model: GEMINI_FLASH, attempts: 3 });
    expect(calls[1].prompt).toContain("not valid JSON");
    expect(calls[2].prompt).toContain("did not match the required schema");
  });

  it("falls back to flash when flash-lite keeps failing with 503", async () => {
    const down = () => new UpstreamError("gemini", 503, "high demand", true);
    const { result, calls } = run(cfg, [down(), down(), down(), down(), good]);
    const value = await result;
    expect(value.model).toBe(GEMINI_FLASH);
    // Four transport tries on lite, then straight to flash (no second lite attempt).
    expect(calls.map((c) => c.model)).toEqual([GEMINI_LITE, GEMINI_LITE, GEMINI_LITE, GEMINI_LITE, GEMINI_FLASH]);
  });

  it("does not retry a non-retryable transport error, and goes to flash", async () => {
    const bad = new UpstreamError("gemini", 400, "bad request", false);
    const { result, calls } = run(cfg, [bad, good]);
    expect(await result).toMatchObject({ model: GEMINI_FLASH, attempts: 2 });
    expect(calls.map((c) => c.model)).toEqual([GEMINI_LITE, GEMINI_FLASH]);
  });

  it("routes languages listed in flashLanguages straight to flash", async () => {
    const { result, calls } = run({ ...cfg, flashLanguages: ["kn-IN"] }, [good], { language: "kn-IN" });
    expect(await result).toMatchObject({ model: GEMINI_FLASH, attempts: 1 });
    expect(calls.map((c) => c.model)).toEqual([GEMINI_FLASH]);
  });

  it("applies each model's requests-per-minute limit separately", async () => {
    vi.useFakeTimers();
    try {
      const { transport, calls } = scripted([good, good, good]);
      const client = geminiClient({ ...cfg, liteRpm: 1, flashRpm: 1 }, { transport, sleep: async () => {}, now: () => Date.now() });
      const req = { purpose: "test", system: "sys", prompt: "p", schema: Schema };
      const a = client.generateJson(req);
      const b = client.generateJson(req);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.map((x) => x.model)).toEqual([GEMINI_LITE]);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls.map((x) => x.model)).toEqual([GEMINI_LITE, GEMINI_LITE]);
      await Promise.all([a, b]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not use flash's quota for lite calls", async () => {
    vi.useFakeTimers();
    try {
      const { transport, calls } = scripted([good, good]);
      const client = geminiClient({ ...cfg, liteRpm: 1, flashRpm: 1, flashLanguages: ["kn-IN"] }, { transport, sleep: async () => {}, now: () => Date.now() });
      const req = { purpose: "test", system: "sys", prompt: "p", schema: Schema };
      const lite = client.generateJson(req);
      const flash = client.generateJson({ ...req, language: "kn-IN" as const });
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.map((x) => x.model)).toEqual([GEMINI_LITE, GEMINI_FLASH]);
      await Promise.all([lite, flash]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws an UpstreamError carrying the last problems when everything fails", async () => {
    const { result } = run(cfg, ["x", "y", "z"]);
    await expect(result).rejects.toThrow(/could not produce a valid test/);
    await expect(run(cfg, ["x", "y", "z"]).result).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("toUpstreamError", () => {
  it("reads the status and retryDelay out of Google's error message", () => {
    const message = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "44s" }] } });
    const err = toUpstreamError(new Error(message));
    expect(err).toMatchObject({ service: "gemini", status: 429, retryable: true, retryAfterMs: 44_000 });
  });

  it("does not sit out a daily quota or a wait of minutes, so the client moves to the other model", () => {
    const perDay = JSON.stringify({ error: { code: 429, details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }, { retryDelay: "30s" }] } });
    expect(toUpstreamError(new Error(perDay))).toMatchObject({ status: 429, retryable: false });
    const long = JSON.stringify({ error: { code: 429, details: [{ retryDelay: "3600s" }] } });
    expect(toUpstreamError(new Error(long))).toMatchObject({ status: 429, retryable: false });
  });

  it("retries 502 and 504 like the other 5xx", () => {
    expect(toUpstreamError(new Error('{"error":{"code":502}}'))).toMatchObject({ status: 502, retryable: true });
    expect(toUpstreamError(new Error('{"error":{"code":504}}'))).toMatchObject({ status: 504, retryable: true });
  });

  it("treats 400s as not retryable", () => {
    expect(toUpstreamError(new Error('{"error":{"code":400,"message":"bad"}}'))).toMatchObject({ status: 400, retryable: false });
  });
});
