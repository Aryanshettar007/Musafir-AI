// Shared plumbing for every external API client: one error type, retry with backoff, fetch with a timeout.
export type UpstreamService = "gemini" | "gnani" | "maps" | "wikipedia" | "storage";

export class UpstreamError extends Error {
  constructor(
    readonly service: UpstreamService,
    readonly status: number | null,
    message: string,
    readonly retryable: boolean,
    // How long the upstream asked us to wait (Retry-After, Google's retryDelay).
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface RetryOptions {
  // Total tries, including the first.
  attempts: number;
  baseDelayMs: number;
  isRetryable?: (e: unknown) => boolean;
  // Overrides the exponential delay when the upstream said how long to wait.
  retryAfterMs?: (e: unknown) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
}

const defaultIsRetryable = (e: unknown) => e instanceof UpstreamError && e.retryable;
const defaultRetryAfter = (e: unknown) => (e instanceof UpstreamError ? e.retryAfterMs : undefined);
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Runs `fn`, retrying retryable failures with exponential backoff (base, 2x base, 4x base, ...).
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const retryAfter = opts.retryAfterMs ?? defaultRetryAfter;
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= opts.attempts || !isRetryable(e)) throw e;
      await sleep(retryAfter(e) ?? opts.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

// fetch that aborts after `timeoutMs`. A timeout is reported as a retryable UpstreamError by the callers' wrappers,
// so here it surfaces as the AbortSignal's TimeoutError.
export function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}

// Seconds ("12") or an HTTP date in a Retry-After header, as milliseconds.
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export const isRetryableStatus = (status: number) => status === 429 || status >= 500;

// Turns a fetch failure (network error, timeout) into a retryable UpstreamError; passes UpstreamErrors through.
export function asUpstreamError(service: UpstreamService, e: unknown): UpstreamError {
  if (e instanceof UpstreamError) return e;
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  const label = name === "TimeoutError" || name === "AbortError" ? "timed out" : `network error: ${message}`;
  return new UpstreamError(service, null, `${service} ${label}`, true);
}
