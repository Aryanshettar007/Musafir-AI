export type LimiterPriority = "high" | "normal";

export interface Limiter {
  run<T>(fn: () => Promise<T>, opts?: { priority?: LimiterPriority }): Promise<T>;
}

export interface LimiterOptions {
  // Jobs running at the same time. High-priority jobs get one extra slot so they never wait behind long normal jobs.
  concurrency: number;
  // Jobs that may START in any sliding 60 s window.
  perMinute?: number;
  // Starts per window that normal jobs may not use, kept free for high-priority jobs (e.g. a live voice question while
  // a trip is being written). Ignored without perMinute.
  reservedForHigh?: number;
  // Injectable for tests (with fake timers); defaults to Date.now.
  now?: () => number;
}

const WINDOW_MS = 60_000;

interface Job {
  priority: LimiterPriority;
  start: () => void;
}

// Runs jobs in arrival order (high-priority jobs ahead of normal ones), never more than `concurrency` at once (+1 for
// high) and never more than `perMinute` starts per minute.
export function createLimiter({ concurrency, perMinute, reservedForHigh = 0, now = () => Date.now() }: LimiterOptions): Limiter {
  const queue: Job[] = [];
  const starts: number[] = [];
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reserve = perMinute === undefined ? 0 : Math.min(reservedForHigh, perMinute - 1);

  function pump(): void {
    while (queue.length > 0) {
      const job = queue[0];
      const high = job.priority === "high";
      if (active >= concurrency + (high ? 1 : 0)) return;
      if (perMinute !== undefined) {
        const t = now();
        while (starts.length > 0 && starts[0] <= t - WINDOW_MS) starts.shift();
        const allowed = perMinute - (high ? 0 : reserve);
        if (starts.length >= allowed) {
          if (!timer) {
            // The oldest start that must expire before this job may begin.
            const blocking = starts[starts.length - allowed];
            timer = setTimeout(() => {
              timer = undefined;
              pump();
            }, Math.max(1, blocking + WINDOW_MS - t));
          }
          return;
        }
        starts.push(t);
      }
      active++;
      queue.shift()!.start();
    }
  }

  return {
    run<T>(fn: () => Promise<T>, opts?: { priority?: LimiterPriority }): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const priority = opts?.priority ?? "normal";
        const job: Job = {
          priority,
          start: () => {
            Promise.resolve().then(fn).then(resolve, reject).finally(() => {
              active--;
              pump();
            });
          },
        };
        if (priority === "high") {
          const firstNormal = queue.findIndex((j) => j.priority === "normal");
          queue.splice(firstNormal === -1 ? queue.length : firstNormal, 0, job);
        } else {
          queue.push(job);
        }
        if (timer && priority === "high") {
          // A high job may be allowed now even though normal jobs are waiting for the window.
          clearTimeout(timer);
          timer = undefined;
        }
        pump();
      });
    },
  };
}
