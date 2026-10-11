import { describe, expect, it } from "vitest";
import type { GnaniClient } from "../src/clients/gnani";
import { createGnaniQueue } from "../src/clients/gnaniQueue";
import { UpstreamError } from "../src/clients/upstream";

const tts = (text: string) => ({ text, voice: "Girish", language: "kn-IN" as const });
const stt = () => ({ audio: Buffer.from("a"), filename: "q.m4a", mimeType: "audio/mp4", languageCode: "kn-IN" });

// A client whose calls finish when the test releases them, and which records how many ran at once.
function gatedClient() {
  const log: string[] = [];
  const gates = new Map<string, () => void>();
  let inFlight = 0, maxInFlight = 0;
  const wait = async (label: string) => {
    log.push(`start ${label}`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => gates.set(label, resolve));
    inFlight--;
  };
  const client: GnaniClient = {
    async tts({ text }) {
      await wait(text);
      return Buffer.from(text);
    },
    async stt() {
      await wait("stt");
      return { transcript: "hi" };
    },
  };
  const release = async (label: string) => {
    // Let the queue reach the call first.
    for (let i = 0; i < 20 && !gates.has(label); i++) await Promise.resolve();
    gates.get(label)!();
    gates.delete(label);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { client, log, release, maxInFlight: () => maxInFlight };
}

const fast = { baseDelayMs: 0, sleep: async () => {} };

describe("createGnaniQueue", () => {
  it("runs one call at a time, FIFO within a priority", async () => {
    const g = gatedClient();
    const queue = createGnaniQueue(g.client, fast);
    const jobs = ["a", "b", "c"].map((t) => queue.tts(tts(t), { priority: "background" }));
    await g.release("a");
    await g.release("b");
    await g.release("c");
    await Promise.all(jobs);
    expect(g.log).toEqual(["start a", "start b", "start c"]);
    expect(g.maxInFlight()).toBe(1);
  });

  it("serves interactive jobs before waiting background jobs, without pre-empting the running one", async () => {
    const g = gatedClient();
    const queue = createGnaniQueue(g.client, fast);
    const jobs = [
      queue.tts(tts("bg1"), { priority: "background" }),
      queue.tts(tts("bg2"), { priority: "background" }),
      queue.stt(stt(), { priority: "interactive" }),
      queue.tts(tts("bg3"), { priority: "background" }),
    ];
    await g.release("bg1");
    await g.release("stt");
    await g.release("bg2");
    await g.release("bg3");
    await Promise.all(jobs);
    expect(g.log).toEqual(["start bg1", "start stt", "start bg2", "start bg3"]);
  });

  it("retries 5xx inside the job so the job keeps its turn", async () => {
    const order: string[] = [];
    let aCalls = 0;
    const client: GnaniClient = {
      async tts({ text }) {
        order.push(text);
        if (text === "a" && ++aCalls < 3) throw new UpstreamError("gnani", 500, "technical difficulties", true);
        return Buffer.from(text);
      },
      stt: async () => ({ transcript: "" }),
    };
    const queue = createGnaniQueue(client, fast);
    const [a, b] = await Promise.all([queue.tts(tts("a"), { priority: "background" }), queue.tts(tts("b"), { priority: "background" })]);
    expect(a.toString()).toBe("a");
    expect(b.toString()).toBe("b");
    expect(order).toEqual(["a", "a", "a", "b"]);
  });

  it("rejects after the attempts run out and still serves the next job", async () => {
    const client: GnaniClient = {
      async tts({ text }) {
        if (text === "bad") throw new UpstreamError("gnani", 429, "RATE_LIMITED", true);
        return Buffer.from(text);
      },
      stt: async () => ({ transcript: "" }),
    };
    const queue = createGnaniQueue(client, { ...fast, attempts: 2 });
    const bad = queue.tts(tts("bad"), { priority: "background" });
    const good = queue.tts(tts("good"), { priority: "background" });
    await expect(bad).rejects.toMatchObject({ status: 429 });
    expect((await good).toString()).toBe("good");
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    const client: GnaniClient = {
      async tts() {
        calls++;
        throw new UpstreamError("gnani", 400, "bad voice", false);
      },
      stt: async () => ({ transcript: "" }),
    };
    await expect(createGnaniQueue(client, fast).tts(tts("x"), { priority: "interactive" })).rejects.toThrow("bad voice");
    expect(calls).toBe(1);
  });
});
