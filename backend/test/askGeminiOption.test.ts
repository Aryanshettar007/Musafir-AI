import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GEMINI_FLASH, GEMINI_LITE, geminiClient, type GeminiCall } from "../src/clients/gemini";
import { UpstreamError } from "../src/clients/upstream";

const Schema = z.object({ a: z.string() });
const cfg = { apiKey: "t", liteRpm: 100, flashRpm: 100, concurrency: 2, flashLanguages: [] };

function run(maxRetryDelayMs: number | undefined) {
  const calls: GeminiCall[] = [];
  const sleeps: number[] = [];
  const client = geminiClient(cfg, {
    sleep: async (ms) => void sleeps.push(ms),
    transport: async (call) => {
      calls.push(call);
      if (call.model === GEMINI_LITE) throw new UpstreamError("gemini", 429, "slow down", true, 40_000);
      return JSON.stringify({ a: "ok" });
    },
  });
  const result = client.generateJson({ purpose: "t", system: "s", prompt: "p", schema: Schema, maxRetryDelayMs });
  return { result, calls, sleeps };
}

describe("GenerateJsonRequest.maxRetryDelayMs", () => {
  it("by default sits out the requested retry delay on the same model", async () => {
    const { result, calls, sleeps } = run(undefined);
    expect((await result).model).toBe(GEMINI_FLASH);
    expect(calls.filter((c) => c.model === GEMINI_LITE)).toHaveLength(4);
    expect(sleeps).toEqual([40_000, 40_000, 40_000]);
  });

  it("moves to flash at once when the requested wait is longer than the limit", async () => {
    const { result, calls, sleeps } = run(3_000);
    expect((await result).model).toBe(GEMINI_FLASH);
    expect(calls.map((c) => c.model)).toEqual([GEMINI_LITE, GEMINI_FLASH]);
    expect(sleeps).toEqual([]);
  });
});
