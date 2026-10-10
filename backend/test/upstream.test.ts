import { describe, expect, it, vi } from "vitest";
import { parseRetryAfter, UpstreamError, withRetry } from "../src/clients/upstream";

const transient = () => new UpstreamError("maps", 503, "unavailable", true);

describe("withRetry", () => {
  it("returns the first success without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    expect(await withRetry(async () => "ok", { attempts: 3, baseDelayMs: 100, sleep })).toBe("ok");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries retryable errors with exponential backoff", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw transient();
        return "done";
      },
      { attempts: 4, baseDelayMs: 100, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toBe("done");
    expect(sleeps).toEqual([100, 200]);
  });

  it("gives up after `attempts` tries and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw transient();
      }, { attempts: 3, baseDelayMs: 1, sleep: async () => {} }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new UpstreamError("maps", 400, "bad request", false);
      }, { attempts: 3, baseDelayMs: 1, sleep: async () => {} }),
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("honours the delay the upstream asked for", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        if (++calls === 1) throw new UpstreamError("gemini", 429, "slow down", true, 44_000);
      },
      { attempts: 2, baseDelayMs: 100, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps).toEqual([44_000]);
  });

  it("accepts custom isRetryable and retryAfterMs", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        if (++calls === 1) throw new Error("flaky");
      },
      { attempts: 2, baseDelayMs: 100, isRetryable: () => true, retryAfterMs: () => 7, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps).toEqual([7]);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and ignores junk", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
