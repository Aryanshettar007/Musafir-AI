import type { GnaniClient, SpeakerEmbedding } from "./gnani";
import { withRetry } from "./upstream";

export type GnaniPriority = "interactive" | "background";

// What every feature uses. Gnani allows ONE in-flight request per API key (a second gets 429 RATE_LIMITED), so all
// calls in the process go through one queue, created once at startup and injected everywhere.
export interface GnaniService {
  tts(req: Parameters<GnaniClient["tts"]>[0], opts: { priority: GnaniPriority }): Promise<Buffer>;
  stt(req: Parameters<GnaniClient["stt"]>[0], opts: { priority: GnaniPriority }): Promise<{ transcript: string }>;
  voiceCloneEmbeddings(
    req: Parameters<GnaniClient["voiceCloneEmbeddings"]>[0],
    opts: { priority: GnaniPriority }
  ): Promise<SpeakerEmbedding>;
}

export interface GnaniQueueOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Job {
  run: () => Promise<void>;
}

// Concurrency 1; `interactive` jobs go before `background` ones, FIFO within a priority. Retries (5xx, 429, timeouts)
// happen inside the job so a retrying job keeps its turn. A running job is never pre-empted: an interactive job
// waits at most one TTS/STT call.
export function createGnaniQueue(client: GnaniClient, opts: GnaniQueueOptions = {}): GnaniService {
  const lanes: Record<GnaniPriority, Job[]> = { interactive: [], background: [] };
  let busy = false;

  const retry = <T>(fn: () => Promise<T>) =>
    withRetry(fn, { attempts: opts.attempts ?? 4, baseDelayMs: opts.baseDelayMs ?? 500, sleep: opts.sleep });

  async function drain(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      for (;;) {
        const job = lanes.interactive.shift() ?? lanes.background.shift();
        if (!job) return;
        await job.run();
      }
    } finally {
      busy = false;
    }
  }

  function enqueue<T>(priority: GnaniPriority, call: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      lanes[priority].push({ run: () => retry(call).then(resolve, reject) });
      void drain();
    });
  }

  return {
    tts: (req, { priority }) => enqueue(priority, () => client.tts(req)),
    stt: (req, { priority }) => enqueue(priority, () => client.stt(req)),
    voiceCloneEmbeddings: (req, { priority }) => enqueue(priority, () => client.voiceCloneEmbeddings(req)),
  };
}
