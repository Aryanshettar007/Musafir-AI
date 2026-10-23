import { UpstreamError, type UpstreamService } from "./upstream";

export interface KeyRing {
  // Runs `fn` with the current key. On a limit error (by default 429) it moves to the next key and runs `fn` again straight away;
  // once every key has hit the limit, the last error is thrown for the caller's normal retry/backoff.
  withKey<T>(fn: (key: string) => Promise<T>): Promise<T>;
}

// Statuses that mean "this key is spent or refused": rate/quota limit, and (for services that report it that way)
// invalid or out-of-credit keys.
export const LIMIT_STATUSES: readonly number[] = [429];

// The key stays in use until it hits a limit, so an exhausted key isn't hit again on every request.
export function createKeyRing(service: UpstreamService, keys: readonly string[], switchOn: readonly number[] = LIMIT_STATUSES): KeyRing {
  if (keys.length === 0) throw new Error(`${service}: at least one API key is required`);
  let current = 0;
  return {
    async withKey<T>(fn: (key: string) => Promise<T>): Promise<T> {
      for (let tried = 1; ; tried++) {
        const index = current;
        try {
          return await fn(keys[index]);
        } catch (e) {
          if (!(e instanceof UpstreamError && e.status !== null && switchOn.includes(e.status)) || tried >= keys.length) throw e;
          // Concurrent calls can fail on the same key: only the first one moves the ring.
          if (current === index) current = (index + 1) % keys.length;
          console.warn(`[${service}] key ${index + 1}/${keys.length} hit a limit, switching to key ${current + 1}`);
        }
      }
    },
  };
}
