import { describe, expect, it, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { memoryStorage } from "./helpers/fakes";
import { fakeGnani } from "./helpers/fakes";
import { createCustomVoice, listUserCustomVoices, deleteCustomVoice, getOrCreateCustomVoiceDemo } from "../src/services/customVoice.service";
import { listVoices } from "../src/services/catalog.service";
import { CustomVoice } from "../src/models/customVoice.model";

describe("CustomVoice service and catalog integration", () => {
  let mongo: MongoMemoryServer;

  beforeEach(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    return async () => {
      await mongoose.disconnect();
      await mongo.stop();
    };
  });

  it("creates a custom voice with embedding, avatar and demo", async () => {
    const storage = memoryStorage();
    const gnani = fakeGnani();

    const voice = await createCustomVoice(
      { gnani, storage },
      {
        userId: "user-123",
        name: "My Cloned Voice",
        gender: "female",
        audioBuffer: Buffer.from("audio-data"),
        audioFilename: "reference.m4a",
        audioMimeType: "audio/m4a",
        avatarBuffer: Buffer.from("avatar-image-data"),
        avatarMimeType: "image/jpeg",
      }
    );

    expect(voice.name).toBe("My Cloned Voice");
    expect(voice.gender).toBe("female");
    expect(voice.isCustom).toBe(true);
    expect(voice.avatarUrl).toContain("custom-voices/avatars/user-123");
    expect(voice.demoUrl).toContain("custom-voices/demos/user-123");

    // Check DB
    const inDb = await CustomVoice.findOne({ userId: "user-123", name: "My Cloned Voice" }).lean();
    expect(inDb).not.toBeNull();
    expect(inDb?.embedding?.embedding).toBe("fake-base64-embedding");
  });

  it("rejects duplicate voice names for the same user", async () => {
    const storage = memoryStorage();
    const gnani = fakeGnani();

    await createCustomVoice(
      { gnani, storage },
      {
        userId: "user-123",
        name: "Duplicate Voice",
        gender: "male",
        audioBuffer: Buffer.from("audio-data"),
        audioFilename: "ref.wav",
        audioMimeType: "audio/wav",
      }
    );

    await expect(
      createCustomVoice(
        { gnani, storage },
        {
          userId: "user-123",
          name: "Duplicate Voice",
          gender: "male",
          audioBuffer: Buffer.from("audio-data-2"),
          audioFilename: "ref2.wav",
          audioMimeType: "audio/wav",
        }
      )
    ).rejects.toThrow("already exists");
  });

  it("lists custom voices at the very top of listVoices for the user", async () => {
    const storage = memoryStorage();
    const gnani = fakeGnani();

    await createCustomVoice(
      { gnani, storage },
      {
        userId: "user-alpha",
        name: "Alpha Voice",
        gender: "male",
        audioBuffer: Buffer.from("audio-data"),
        audioFilename: "ref.m4a",
        audioMimeType: "audio/m4a",
      }
    );

    // List voices without userId -> custom voice is NOT included
    const publicList = await listVoices("en-IN", "male", storage);
    expect(publicList.some((v) => v.name === "Alpha Voice")).toBe(false);

    // List voices with userId -> custom voice IS first on top!
    const userList = await listVoices("en-IN", "male", storage, "user-alpha");
    expect(userList.length).toBeGreaterThan(1);
    expect(userList[0].name).toBe("Alpha Voice");
    expect(userList[0].isCustom).toBe(true);
  });

  it("deletes a custom voice by id", async () => {
    const storage = memoryStorage();
    const gnani = fakeGnani();

    const voice = await createCustomVoice(
      { gnani, storage },
      {
        userId: "user-del",
        name: "To Delete",
        gender: "female",
        audioBuffer: Buffer.from("audio-data"),
        audioFilename: "ref.m4a",
        audioMimeType: "audio/m4a",
      }
    );

    const delRes = await deleteCustomVoice("user-del", voice.id!);
    expect(delRes.deleted).toBe(true);

    const list = await listUserCustomVoices("user-del", storage);
    expect(list.length).toBe(0);
  });

  it("synthesizes multilingual demo on-demand and caches it in storage", async () => {
    const storage = memoryStorage();
    const gnani = fakeGnani();

    const voice = await createCustomVoice(
      { gnani, storage },
      {
        userId: "user-lang",
        name: "Polyglot",
        gender: "male",
        audioBuffer: Buffer.from("audio-data"),
        audioFilename: "ref.m4a",
        audioMimeType: "audio/m4a",
      }
    );

    // First call for Kannada -> generates audio
    const knResult = await getOrCreateCustomVoiceDemo({ storage, gnani }, voice.id!, "kn-IN");
    expect(knResult.audioBuffer).toBeDefined();

    // Second call for Kannada -> returns cached storage URL
    const knCached = await getOrCreateCustomVoiceDemo({ storage, gnani }, voice.id!, "kn-IN");
    expect(knCached.redirectUrl).toBeDefined();

    // In listVoices for kn-IN, demoUrl should point to the generated demo in storage
    const listKn = await listVoices("kn-IN", "male", storage, "user-lang");
    expect(listKn[0].demoUrl).toBeDefined();
    expect(listKn[0].demoUrl).toContain("custom-voices/demos/user-lang");
  });
});
