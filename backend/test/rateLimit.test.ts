import { describe, expect, it } from "vitest";
import { createRateCounter } from "../src/middleware/rateLimit";

describe("createRateCounter", () => {
  it("allows up to max hits per key inside the window, then reports when to retry", () => {
    let t = 1_000;
    const c = createRateCounter({ max: 2, windowMs: 10_000, now: () => t });
    expect(c.hit("a")).toEqual({ allowed: true });
    t += 3_000;
    expect(c.hit("a")).toEqual({ allowed: true });
    t += 1_000;
    expect(c.hit("a")).toEqual({ allowed: false, retryAfterMs: 6_000 });
  });

  it("counts keys separately", () => {
    const c = createRateCounter({ max: 1, windowMs: 10_000, now: () => 0 });
    expect(c.hit("a").allowed).toBe(true);
    expect(c.hit("b").allowed).toBe(true);
    expect(c.hit("a").allowed).toBe(false);
  });

  it("slides: an old hit stops counting once the window has passed", () => {
    let t = 0;
    const c = createRateCounter({ max: 1, windowMs: 10_000, now: () => t });
    c.hit("a");
    t = 9_999;
    expect(c.hit("a").allowed).toBe(false);
    t = 10_000;
    expect(c.hit("a").allowed).toBe(true);
  });

  it("does not count rejected attempts", () => {
    let t = 0;
    const c = createRateCounter({ max: 1, windowMs: 10_000, now: () => t });
    c.hit("a");
    for (t = 1_000; t < 10_000; t += 1_000) c.hit("a");
    t = 10_000;
    expect(c.hit("a").allowed).toBe(true);
  });

  it("forgets users whose last hit is outside the window, so memory stays bounded", () => {
    let t = 0;
    const c = createRateCounter({ max: 5, windowMs: 10_000, now: () => t });
    for (let i = 0; i < 100; i++) c.hit(`user${i}`);
    expect(c.size).toBe(100);
    t = 10_000;
    c.hit("late");
    expect(c.size).toBe(1);
  });
});
