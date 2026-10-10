import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localStorage } from "../src/clients/storage";

let root: string;
let storage: ReturnType<typeof localStorage>;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "musafir-storage-"));
  storage = localStorage(root, "http://192.168.1.5:3000/");
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("localStorage", () => {
  it("writes files under the root and returns a /files URL", async () => {
    await storage.put("voice-demos/kn-IN/Girish.mp3", Buffer.from("mp3"), "audio/mpeg");
    expect(await readFile(path.join(root, "voice-demos", "kn-IN", "Girish.mp3"), "utf8")).toBe("mp3");
    expect(await storage.url("voice-demos/kn-IN/Girish.mp3")).toBe("http://192.168.1.5:3000/files/voice-demos/kn-IN/Girish.mp3");
  });

  it("rejects keys that could escape the root", async () => {
    for (const key of ["../secret", "a/../../b", "/abs", "a\\b"]) {
      await expect(storage.put(key, Buffer.from(""), "text/plain"), key).rejects.toThrow("Invalid storage key");
    }
  });
});
