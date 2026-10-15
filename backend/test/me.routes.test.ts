import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { User } from "../src/models/user.model";
import { Trip } from "../src/models/trip.model";
import { Listen } from "../src/models/listen.model";
import { Report } from "../src/models/report.model";
import { VoiceDemo } from "../src/models/voiceDemo.model";
import { newTrip } from "./tripBuilder.helpers";

// Fake verifier: the token is "uid:<uid>". Real tokens are checked by firebase-admin in production.
const app = createApp({
  verifyIdToken: async (token) => {
    if (!token.startsWith("uid:")) throw new Error("bad token");
    const uid = token.slice(4);
    return { uid, email: `${uid}@example.com` };
  },
  storage: { put: async () => {}, url: async (key) => `https://cdn.example/${key}?sig=test` },
});

const as = (uid: string) => ({ Authorization: `Bearer uid:${uid}` });

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init(); // build the unique index on firebaseUid
  await VoiceDemo.create({
    voice: "Nalini", language: "hi-IN", gender: "female", storageKey: "voice-demos/hi-IN/Nalini.mp3",
    bytes: 131000, durationS: 8.4, text: "नमस्ते",
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Listen.deleteMany({});
  await Report.deleteMany({});
});

describe("auth", () => {
  it("protects every API route but leaves /health public", async () => {
    for (const path of ["/me", "/catalog", "/voices?language=en-IN", "/nope"]) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
    expect((await request(app).get("/health")).status).toBe(200);
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("rejects an invalid token", async () => {
    const res = await request(app).get("/me").set("Authorization", "Bearer nope");
    expect(res.status).toBe(401);
  });
});

describe("GET /me", () => {
  it("returns 404 PROFILE_NOT_FOUND before onboarding", async () => {
    const res = await request(app).get("/me").set(as("u1"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PROFILE_NOT_FOUND");
  });
});

describe("PUT /me", () => {
  it("creates the profile (201), stores it, and GET /me returns it", async () => {
    const body = { name: "Aryan", gender: "male", age: 22, language: "kn-IN", interests: ["history", "food"] };
    const put = await request(app).put("/me").set(as("u1")).send(body);
    expect(put.status).toBe(201);
    expect(put.body.data).toMatchObject({
      ...body,
      email: "u1@example.com",
      voiceGender: "male",
      voice: "Girish",
      musicMode: "rj",
    });
    expect(put.body.data).not.toHaveProperty("_id");
    expect(put.body.data).not.toHaveProperty("firebaseUid");

    const get = await request(app).get("/me").set(as("u1"));
    expect(get.status).toBe(200);
    expect(get.body.data).toEqual(put.body.data);
    expect(await User.countDocuments()).toBe(1);
  });

  it("works with an empty body (Skip for now)", async () => {
    const res = await request(app).put("/me").set(as("u1")).send({});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ language: "en-IN", voice: "Deepak", interests: ["history", "food"] });
  });

  it("accepts an age range like 18-24", async () => {
    const res = await request(app).put("/me").set(as("u1")).send({ age: "18-24" });
    expect(res.status).toBe(201);
    expect(res.body.data.age).toBe("18-24");
  });

  it("replaces an existing profile (200) and clears fields left out", async () => {
    await request(app).put("/me").set(as("u1")).send({ name: "Aryan", age: 22 });
    const res = await request(app).put("/me").set(as("u1")).send({ language: "hi-IN" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ language: "hi-IN" });
    expect(res.body.data).not.toHaveProperty("name");
    expect(res.body.data).not.toHaveProperty("age");
    expect(await User.countDocuments()).toBe(1);
  });

  it("keeps users separate", async () => {
    await request(app).put("/me").set(as("u1")).send({ name: "One" });
    await request(app).put("/me").set(as("u2")).send({ name: "Two" });
    expect((await request(app).get("/me").set(as("u1"))).body.data.name).toBe("One");
    expect((await request(app).get("/me").set(as("u2"))).body.data.name).toBe("Two");
  });

  it("rejects invalid values and unknown fields with VALIDATION_FAILED", async () => {
    for (const body of [{ language: "es-ES" }, { language: "kn-mixed" }, { age: "22" }, { interests: [] }, { interests: ["shopping"] }, { spotify: true }]) {
      const res = await request(app).put("/me").set(as("u1")).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects an unknown voice", async () => {
    const res = await request(app).put("/me").set(as("u1")).send({ voice: "Morgan" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNKNOWN_VOICE");
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app).put("/me").set(as("u1")).set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("PATCH /me", () => {
  it("returns 404 before onboarding", async () => {
    const res = await request(app).patch("/me").set(as("u1")).send({ musicMode: "off" });
    expect(res.status).toBe(404);
  });

  it("updates only the fields sent", async () => {
    await request(app).put("/me").set(as("u1")).send({ name: "Aryan", language: "en-IN" });
    const res = await request(app).patch("/me").set(as("u1")).send({ language: "kn-IN", musicMode: "off" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Aryan", language: "kn-IN", voice: "Girish", musicMode: "off" });
  });
});

describe("DELETE /me", () => {
  it("requires authentication", async () => {
    const res = await request(app).delete("/me");
    expect(res.status).toBe(401);
  });

  it("deletes user profile, trips, listens, and reports, leaving other users untouched", async () => {
    await request(app).put("/me").set(as("u1")).send({ name: "User One", language: "kn-IN" });
    await request(app).put("/me").set(as("u2")).send({ name: "User Two", language: "en-IN" });

    await newTrip("u1");
    await newTrip("u2");

    await Report.create({
      userId: "u1",
      tripId: new mongoose.Types.ObjectId(),
      itemId: new mongoose.Types.ObjectId(),
      reason: "inaccurate",
      details: "Wrong story",
    });
    await Report.create({
      userId: "u2",
      tripId: new mongoose.Types.ObjectId(),
      itemId: new mongoose.Types.ObjectId(),
      reason: "inappropriate",
      details: "Bad story",
    });

    expect(await User.countDocuments()).toBe(2);
    expect(await Trip.countDocuments()).toBe(2);
    expect(await Report.countDocuments()).toBe(2);

    const res = await request(app).delete("/me").set(as("u1")).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Account and associated data deleted successfully." });

    expect(await User.findOne({ firebaseUid: "u1" })).toBeNull();
    expect(await Trip.findOne({ userId: "u1" })).toBeNull();
    expect(await Report.findOne({ userId: "u1" })).toBeNull();

    expect(await User.findOne({ firebaseUid: "u2" })).not.toBeNull();
    expect(await Trip.findOne({ userId: "u2" })).not.toBeNull();
    expect(await Report.findOne({ userId: "u2" })).not.toBeNull();
  });

  it("succeeds even if the user has no profile or trips", async () => {
    const res = await request(app).delete("/me").set(as("u_nonexistent")).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("also works on DELETE /me/account", async () => {
    await request(app).put("/me").set(as("u_acc")).send({ name: "Test" });
    const res = await request(app).delete("/me/account").set(as("u_acc")).send({});
    expect(res.status).toBe(200);
    expect(await User.findOne({ firebaseUid: "u_acc" })).toBeNull();
  });
});

describe("catalog", () => {
  it("GET /catalog lists the onboarding options", async () => {
    const res = await request(app).get("/catalog").set(as("u1"));
    expect(res.status).toBe(200);
    expect(res.body.data.languages.map((l: { id: string }) => l.id)).toEqual(
      ["en-IN", "hi-IN", "hi-en", "kn-IN", "ta-IN", "te-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN"],
    );
    expect(res.body.data.defaults).toEqual({ language: "en-IN", interests: ["history", "food"], musicMode: "rj" });
  });

  it("GET /voices requires a supported language", async () => {
    expect((await request(app).get("/voices").set(as("u1"))).status).toBe(400);
    const res = await request(app).get("/voices?language=hi-IN&gender=female").set(as("u1"));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      name: "Nalini",
      gender: "female",
      recommended: true,
      demoUrl: "https://cdn.example/voice-demos/hi-IN/Nalini.mp3?sig=test",
      avatarUrl: "https://cdn.example/voice-avatars/Nalini.webp?sig=test",
    });
    expect(res.body.data.find((v: { name: string }) => v.name === "Ambuja").demoUrl).toBeNull();
    expect(res.body.data.find((v: { name: string }) => v.name === "Ambuja").avatarUrl).toBe(
      "https://cdn.example/voice-avatars/Ambuja.webp?sig=test",
    );
  });

  it("unknown routes return the standard 404 shape", async () => {
    const res = await request(app).get("/nope").set(as("u1"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
