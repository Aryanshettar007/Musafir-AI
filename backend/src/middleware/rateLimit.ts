import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors";

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  now?: () => number; // injectable clock for tests
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

// Sliding-window counter per key, in memory (one server process; resets on restart, which is fine for abuse control).
export function createRateCounter({ max, windowMs, now = Date.now }: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  // Drop keys whose newest hit is outside the window, so the map doesn't grow with every user ever seen.
  function sweep(t: number) {
    if (t - lastSweep < windowMs) return;
    lastSweep = t;
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || t - stamps[stamps.length - 1] >= windowMs) hits.delete(key);
    }
  }

  return {
    // Keys currently held (memory use is bounded by the users active in one window).
    get size() {
      return hits.size;
    },
    // Counts this attempt when it is allowed. Rejected attempts are not counted, so waiting always helps.
    hit(key: string): RateLimitResult {
      const t = now();
      sweep(t);
      const stamps = (hits.get(key) ?? []).filter((s) => t - s < windowMs);
      if (stamps.length >= max) {
        hits.set(key, stamps);
        return { allowed: false, retryAfterMs: stamps[0] + windowMs - t };
      }
      stamps.push(t);
      hits.set(key, stamps);
      return { allowed: true };
    },
  };
}

// Express middleware for routes behind requireAuth: limits per user (falls back to the IP).
export function rateLimit(opts: RateLimitOptions & { code?: string; message?: string }): RequestHandler {
  const counter = createRateCounter(opts);
  return (req: Request, res: Response, next: NextFunction) => {
    const result = counter.hit(req.identity?.uid ?? req.ip ?? "anonymous");
    if (result.allowed) return next();
    const retryAfterS = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    res.setHeader("Retry-After", String(retryAfterS));
    throw new AppError(429, opts.code ?? "RATE_LIMITED", opts.message ?? "Too many requests. Try again shortly.", { retryAfterS });
  };
}
