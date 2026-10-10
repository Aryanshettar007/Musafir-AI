import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { UpstreamError } from "../src/clients/upstream";
import { Place } from "../src/models/place.model";
import { askRouter } from "../src/routes/ask.routes";
import { createAskService } from "../src/services/ask/ask.service";
import { answer, makePlace, makeProfile, makeTrip } from "./askFixtures";
import { authHeader, fakeGemini, fakeGnani, fakeMaps, fakeVerifyIdToken, memoryStorage, SHORT_MP3, type FakeGemini } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";

const KN = "ಇದು ಹಳೆಯ ಕೋಟೆ.";

beforeAll(async () => {
  await startMongo();
  await Place.init();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(stopMongo);
beforeEach(async () => {
  await clearCollections();
  await makeProfile("u1", { language: "kn-IN" });
});

function build(script: Parameters<typeof fakeGemini>[0] = () => answer(KN), limit?: { max: number; windowMs: number; now?: () => number }) {
  const gemini: FakeGemini = fakeGemini(script);
  const gnani = fakeGnani({ transcript: "ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್" });
  const storage = memoryStorage();
  const put = vi.spyOn(storage, "put");
  const ask = createAskService({ gemini, gnani, maps: fakeMaps() });
  const app = createApp({
    verifyIdToken: fakeVerifyIdToken,
    storage,
    routers: [{ path: "/ask", router: askRouter({ ask, rateLimit: limit }) }],
  });
  return { app, gemini, gnani, put, storage };
}

const form = (app: ReturnType<typeof build>["app"], uid = "u1") => request(app).post("/ask").set(authHeader(uid));
const withPosition = (r: request.Test) => r.field("lat", "12.45").field("lng", "76.69");

async function docCounts() {
  const counts: Record<string, number> = {};
  for (const [name, c] of Object.entries(mongoose.connection.collections)) counts[name] = await c.countDocuments();
  return counts;
}

describe("POST /ask", () => {
  it("requires a token", async () => {
    const { app } = build();
    const res = await request(app).post("/ask").field("text", "hi").field("lat", "1").field("lng", "1");
    expect(res.status).toBe(401);
  });

  it("answers a typed question with the documented response shape", async () => {
    const { app } = build();
    const res = await withPosition(form(app).field("text", "ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      transcript: "ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್",
      answerText: KN,
      language: "kn-IN",
      voice: "Girish",
      audio: { mimeType: "audio/mpeg", base64: SHORT_MP3.toString("base64"), durationS: expect.any(Number) },
      timingsMs: { stt: 0, llm: expect.any(Number), tts: expect.any(Number), total: expect.any(Number) },
    });
    expect(res.body.data.model).toBeUndefined();
  });

  it("answers an audio question: STT, then the answer, with a trip and history", async () => {
    const trip = await makeTrip("u1", { language: "en-IN" });
    const { app, gemini, gnani } = build([answer("It is old.")]);
    const history = JSON.stringify([{ q: "what is this?", a: "A fort." }]);
    const res = await withPosition(
      form(app)
        .attach("audio", SHORT_MP3, { filename: "q.mp3", contentType: "audio/mpeg" })
        .field("tripId", trip._id.toString())
        .field("history", history)
        .field("heading", "90"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transcript: "ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್", answerText: "It is old.", language: "en-IN", voice: "Deepak" });
    expect(res.body.data.timingsMs.stt).toBeGreaterThanOrEqual(0);
    expect(gnani.calls.map((c) => c.kind)).toEqual(["stt", "tts"]);
    expect(gemini.calls[0].prompt).toContain("Passenger: what is this?");
  });

  it("ignores a blank optional field and accepts an audio mime type the phone got wrong", async () => {
    const { app } = build();
    const res = await withPosition(
      form(app).attach("audio", SHORT_MP3, { filename: "q.m4a", contentType: "application/octet-stream" }).field("tripId", "").field("heading", ""),
    );
    expect(res.status).toBe(200);
  });

  describe("validation", () => {
    it.each([
      ["no audio or text", (r: request.Test) => r.field("lat", "1").field("lng", "1")],
      ["both audio and text", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").attach("audio", SHORT_MP3, "q.mp3")],
      ["no position", (r: request.Test) => r.field("text", "hi")],
      ["latitude out of range", (r: request.Test) => r.field("lat", "91").field("lng", "1").field("text", "hi")],
      ["blank latitude", (r: request.Test) => r.field("lat", "").field("lng", "1").field("text", "hi")],
      ["a history field over 256 KB", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").field("history", "x".repeat(300_000))],
      ["unknown language", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").field("language", "fr-FR")],
      ["text over 500 characters", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "x".repeat(501))],
      ["malformed tripId", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").field("tripId", "abc")],
      ["history that is not JSON", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").field("history", "{nope")],
      ["history of the wrong shape", (r: request.Test) => r.field("lat", "1").field("lng", "1").field("text", "hi").field("history", '[{"q":1}]')],
    ])("rejects %s with VALIDATION_FAILED", async (_name, setUp) => {
      const { app, gemini, gnani } = build();
      const res = await setUp(form(app));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(gemini.calls).toHaveLength(0);
      expect(gnani.calls).toHaveLength(0);
    });

    it("accepts a long history by using only the last turns", async () => {
      const { app, gemini } = build();
      const history = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ q: `question${i}`, a: "a".repeat(900) })));
      const res = await withPosition(form(app).field("text", "hi").field("history", history));
      expect(res.status).toBe(200);
      expect(gemini.calls[0].prompt).toContain("question9");
      expect(gemini.calls[0].prompt).not.toContain("question3");
    });
  });

  it("returns UNSUPPORTED_AUDIO (415) for a file that is not audio", async () => {
    const { app } = build();
    const res = await withPosition(form(app).attach("audio", Buffer.from("hello world, not audio"), { filename: "q.mp3", contentType: "audio/mpeg" }));
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_AUDIO");
  });

  it("returns AUDIO_TOO_LONG (422) over 25 seconds", async () => {
    const { app, gnani } = build();
    const long = Buffer.concat(Array.from({ length: 8 }, () => SHORT_MP3));
    expect(long.length).toBeLessThan(2 * 1024 * 1024);
    const res = await withPosition(form(app).attach("audio", long, { filename: "q.mp3", contentType: "audio/mpeg" }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("AUDIO_TOO_LONG");
    expect(gnani.calls).toHaveLength(0);
  });

  it("returns AUDIO_TOO_LARGE (413) over 2 MB", async () => {
    const { app } = build();
    const res = await withPosition(form(app).attach("audio", Buffer.alloc(2 * 1024 * 1024 + 10), { filename: "q.mp3", contentType: "audio/mpeg" }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("AUDIO_TOO_LARGE");
  });

  it("returns NOTHING_HEARD (422) when the transcript is empty", async () => {
    const { app, gnani } = build();
    gnani.stt = async () => ({ transcript: "" });
    // The service holds the same object, so replacing stt on it is seen by the route.
    const res = await withPosition(form(app).attach("audio", SHORT_MP3, { filename: "q.mp3", contentType: "audio/mpeg" }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOTHING_HEARD");
  });

  it("returns TRIP_NOT_FOUND (404) for another user's trip", async () => {
    const trip = await makeTrip("someone-else");
    const { app } = build();
    const res = await withPosition(form(app).field("text", "hi").field("tripId", trip._id.toString()));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TRIP_NOT_FOUND");
  });

  it("returns PROFILE_NOT_FOUND (404) before onboarding", async () => {
    const { app } = build();
    const res = await withPosition(form(app, "new-user").field("text", "hi"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PROFILE_NOT_FOUND");
  });

  it("returns UPSTREAM_UNAVAILABLE (502) when Gemini cannot answer", async () => {
    const { app } = build([new UpstreamError("gemini", null, "no valid answer", false)]);
    const res = await withPosition(form(app).field("text", "hi"));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("limits each user separately (RATE_LIMITED 429 with Retry-After) and lets them in again later", async () => {
    let t = 0;
    const { app } = build(() => answer(KN), { max: 2, windowMs: 600_000, now: () => t });
    await makeProfile("u2", { language: "kn-IN" });
    const ask = (uid: string) => withPosition(form(app, uid).field("text", "hi"));
    expect((await ask("u1")).status).toBe(200);
    expect((await ask("u1")).status).toBe(200);
    const limited = await ask("u1");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatchObject({ code: "RATE_LIMITED", details: { retryAfterS: 600 } });
    expect(limited.headers["retry-after"]).toBe("600");
    expect((await ask("u2")).status).toBe(200);
    t = 600_001;
    expect((await ask("u1")).status).toBe(200);
  });

  it("stores nothing: no collection gains documents and storage put is never called", async () => {
    const trip = await makeTrip("u1", { language: "en-IN" });
    await makePlace("Fort", { lat: 12.46, lng: 76.69 });
    const before = await docCounts();
    const { app, put } = build([answer("It is old.")]);
    const res = await withPosition(
      form(app).attach("audio", SHORT_MP3, { filename: "q.mp3", contentType: "audio/mpeg" }).field("tripId", trip._id.toString()),
    );
    expect(res.status).toBe(200);
    expect(await docCounts()).toEqual(before);
    expect(put).not.toHaveBeenCalled();
  });
});
