import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimiter } from "../src/clients/limiter";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// A job that finishes when the test says so.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("never runs more than `concurrency` jobs at once, in arrival order", async () => {
    const limiter = createLimiter({ concurrency: 2 });
    const started: number[] = [];
    const gates = [deferred(), deferred(), deferred()];
    const jobs = gates.map((g, i) =>
      limiter.run(async () => {
        started.push(i);
        await g.promise;
        return i;
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);
    gates[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1, 2]);
    gates[1].resolve();
    gates[2].resolve();
    expect(await Promise.all(jobs)).toEqual([0, 1, 2]);
  });

  it("starts at most `perMinute` jobs in any sliding 60 s window", async () => {
    const limiter = createLimiter({ concurrency: 10, perMinute: 2, now: () => Date.now() });
    const startedAt: number[] = [];
    const t0 = Date.now();
    const jobs = [0, 1, 2, 3].map(() => limiter.run(async () => void startedAt.push(Date.now() - t0)));
    await vi.advanceTimersByTimeAsync(0);
    expect(startedAt).toEqual([0, 0]);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(startedAt).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(startedAt).toEqual([0, 0, 60_000, 60_000]);
    await Promise.all(jobs);
  });

  it("keeps running after a job fails", async () => {
    const limiter = createLimiter({ concurrency: 1 });
    const bad = limiter.run(async () => {
      throw new Error("boom");
    });
    const good = limiter.run(async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
  });

  it("turns a synchronous throw into a rejection", async () => {
    const limiter = createLimiter({ concurrency: 1 });
    await expect(limiter.run(() => { throw new Error("sync"); })).rejects.toThrow("sync");
  });
});

describe("createLimiter priorities", () => {
  it("runs a high-priority job before queued normal jobs, using an extra slot", async () => {
    const limiter = createLimiter({ concurrency: 1 });
    const started: string[] = [];
    const gate = deferred();
    const blocker = limiter.run(async () => { started.push("n0"); await gate.promise; });
    const n1 = limiter.run(async () => void started.push("n1"));
    const h = limiter.run(async () => void started.push("h"), { priority: "high" });
    await vi.advanceTimersByTimeAsync(0);
    // The long normal job still holds the only normal slot; the high job used the extra one.
    expect(started).toEqual(["n0", "h"]);
    gate.resolve();
    await Promise.all([blocker, n1, h]);
    expect(started).toEqual(["n0", "h", "n1"]);
  });

  it("keeps reserved starts per minute free for high-priority jobs", async () => {
    const limiter = createLimiter({ concurrency: 10, perMinute: 3, reservedForHigh: 1, now: () => Date.now() });
    const t0 = Date.now();
    const startedAt: Array<[string, number]> = [];
    const job = (name: string) => async () => void startedAt.push([name, Date.now() - t0]);
    const normals = ["n0", "n1", "n2"].map((n) => limiter.run(job(n)));
    await vi.advanceTimersByTimeAsync(0);
    // Normal jobs may use only 2 of the 3 starts.
    expect(startedAt.map(([n]) => n)).toEqual(["n0", "n1"]);
    const high = limiter.run(job("h"), { priority: "high" });
    await vi.advanceTimersByTimeAsync(0);
    expect(startedAt.map(([n]) => n)).toEqual(["n0", "n1", "h"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([...normals, high]);
    expect(startedAt.find(([n]) => n === "n2")![1]).toBeGreaterThanOrEqual(60_000);
  });

  it("puts high-priority jobs behind earlier high jobs but ahead of normal ones", async () => {
    const limiter = createLimiter({ concurrency: 1, perMinute: 1, now: () => Date.now() });
    const order: string[] = [];
    const run = (n: string, priority?: "high") => limiter.run(async () => void order.push(n), { priority });
    const all = [run("n0"), run("n1"), run("h0", "high"), run("h1", "high")];
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await Promise.all(all);
    expect(order).toEqual(["n0", "h0", "h1", "n1"]);
  });
});
