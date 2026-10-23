import { describe, expect, it, vi } from "vitest";
import { apiKeysFrom } from "../src/config/env";
import { createKeyRing } from "../src/clients/keyRing";
import { UpstreamError } from "../src/clients/upstream";

const limit = () => new UpstreamError("gemini", 429, "quota", true);

describe("createKeyRing", () => {
  it("uses the first key until it hits a limit, then moves on and stays there", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ring = createKeyRing("gemini", ["a", "b", "c"]);
    const used: string[] = [];
    const fn = async (key: string) => {
      used.push(key);
      if (key === "a") throw limit();
      return key;
    };
    expect(await ring.withKey(fn)).toBe("b");
    expect(await ring.withKey(fn)).toBe("b");
    expect(used).toEqual(["a", "b", "b"]);
  });

  it("throws the limit error once every key has hit it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ring = createKeyRing("gnani", ["a", "b"]);
    const fn = vi.fn(async () => {
      throw limit();
    });
    await expect(ring.withKey(fn)).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("switches on the statuses it is configured with", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ring = createKeyRing("gnani", ["a", "b"], [402, 429]);
    const fn = async (key: string) => {
      if (key === "a") throw new UpstreamError("gnani", 402, "no credit", false);
      return key;
    };
    expect(await ring.withKey(fn)).toBe("b");
  });

  it("does not switch keys for other errors", async () => {
    const ring = createKeyRing("gemini", ["a", "b"]);
    const fn = vi.fn(async () => {
      throw new UpstreamError("gemini", 500, "boom", true);
    });
    await expect(ring.withKey(fn)).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("apiKeysFrom", () => {
  it("collects NAME1..N in numeric order, skipping blanks and other variables", () => {
    const env = { GEMINI_API_KEY2: "two", GEMINI_API_KEY10: "ten", GEMINI_API_KEY1: "one", GEMINI_API_KEY3: " ", GEMINI_API_KEYX: "no", OTHER: "x" };
    expect(apiKeysFrom(env, "GEMINI_API_KEY")).toEqual(["one", "two", "ten"]);
  });

  it("accepts the old single-key name", () => {
    expect(apiKeysFrom({ GNANI_API_KEY: "solo" }, "GNANI_API_KEY")).toEqual(["solo"]);
  });
});
