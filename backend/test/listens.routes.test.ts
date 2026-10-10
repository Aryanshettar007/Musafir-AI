import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { Listen } from "../src/models/listen.model";
import { Trip } from "../src/models/trip.model";
import { tripRouters } from "../src/routes/trips.routes";
import { authHeader, fakeMaps, fakeVerifyIdToken, memoryStorage } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";
import { newTrip } from "./tripBuilder.helpers";

const storage = memoryStorage();
const app = createApp({
  verifyIdToken: fakeVerifyIdToken,
  storage,
  routers: tripRouters({ maps: fakeMaps(), builder: { start: async () => {} }, storage, limits: { tripsPerDay: 10, maxRouteKm: 1200 } }),
});

beforeAll(async () => {
  await startMongo();
  await Listen.init();
});
afterAll(async () => {
  await stopMongo();
  await mongoose.disconnect();
});
beforeEach(clearCollections);

async function tripWithItems(userId: string) {
  const place = new Types.ObjectId();
  const story = new Types.ObjectId();
  const [a, b] = [new Types.ObjectId(), new Types.ObjectId()];
  const trip = await newTrip(userId, {
    status: "ready",
    stage: "done",
    items: [
      { _id: a, type: "story", status: "ready", focus: "general", side: "left", targetSeconds: 60, anchorRouteDistanceM: 1000, placeIds: [place], storyId: story },
      { _id: b, type: "sponsored", status: "ready", focus: "general", side: "none", targetSeconds: 20, anchorRouteDistanceM: 2000, sponsor: { slug: "x", name: "X" } },
    ],
  });
  return { trip, a, b, place, story };
}

const ev = (over: Record<string, unknown>) => ({ id: "e1", event: "completed", at: "2026-10-10T08:15:00Z", ...over });

describe("POST /listens", () => {
  it("requires authentication", async () => {
    expect((await request(app).post("/listens").send({ events: [] })).status).toBe(401);
  });

  it("accepts the same batch sent twice at the same moment (no duplicate-key 500)", async () => {
    const { trip, a } = await tripWithItems("u1");
    const events = Array.from({ length: 50 }, (_, i) => ev({ id: `c${i}`, tripId: String(trip._id), itemId: String(a) }));
    const responses = await Promise.all([1, 2, 3].map(() => request(app).post("/listens").set(authHeader("u1")).send({ events })));
    for (const res of responses) expect([res.status, res.body.data?.accepted]).toEqual([200, 50]);
    expect(await Listen.countDocuments()).toBe(50);
  });

  it("records events with the item's story and places", async () => {
    const { trip, a, b, place, story } = await tripWithItems("u1");
    const res = await request(app).post("/listens").set(authHeader("u1")).send({
      events: [ev({ id: "e1", tripId: String(trip._id), itemId: String(a) }), ev({ id: "e2", tripId: String(trip._id), itemId: String(b), event: "started" })],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { accepted: 2, rejected: [] } });
    const docs = await Listen.find().sort({ clientEventId: 1 }).lean();
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ userId: "u1", clientEventId: "e1", event: "completed" });
    expect(docs[0].storyId?.equals(story)).toBe(true);
    expect(docs[0].placeIds.map(String)).toEqual([String(place)]);
    expect(docs[0].at.toISOString()).toBe("2026-10-10T08:15:00.000Z");
    // The sponsored item has no story.
    expect(docs[1].storyId).toBeUndefined();
  });

  it("is idempotent: resending a batch changes nothing", async () => {
    const { trip, a } = await tripWithItems("u1");
    const payload = { events: [ev({ id: "e1", tripId: String(trip._id), itemId: String(a) })] };
    const first = await request(app).post("/listens").set(authHeader("u1")).send(payload);
    const again = await request(app).post("/listens").set(authHeader("u1")).send(payload);
    expect(first.body.data).toEqual(again.body.data);
    expect(await Listen.countDocuments()).toBe(1);
    // A resend with a different event type under the same id doesn't rewrite history.
    await request(app).post("/listens").set(authHeader("u1")).send({ events: [ev({ id: "e1", tripId: String(trip._id), itemId: String(a), event: "skipped" })] });
    expect((await Listen.findOne().lean())?.event).toBe("completed");
  });

  it("rejects events for trips and items the user doesn't own, event by event", async () => {
    const mine = await tripWithItems("u1");
    const theirs = await tripWithItems("u2");
    const res = await request(app).post("/listens").set(authHeader("u1")).send({
      events: [
        ev({ id: "ok", tripId: String(mine.trip._id), itemId: String(mine.a) }),
        ev({ id: "other-user", tripId: String(theirs.trip._id), itemId: String(theirs.a) }),
        ev({ id: "no-trip", tripId: String(new Types.ObjectId()), itemId: String(mine.a) }),
        ev({ id: "wrong-item", tripId: String(mine.trip._id), itemId: String(theirs.a) }),
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accepted: 1,
      rejected: [
        { id: "other-user", code: "TRIP_NOT_FOUND" },
        { id: "no-trip", code: "TRIP_NOT_FOUND" },
        { id: "wrong-item", code: "ITEM_NOT_FOUND" },
      ],
    });
    expect(await Listen.countDocuments()).toBe(1);
    expect(await Trip.countDocuments()).toBe(2);
  });

  it("scopes event ids per user", async () => {
    const a = await tripWithItems("u1");
    const b = await tripWithItems("u2");
    await request(app).post("/listens").set(authHeader("u1")).send({ events: [ev({ id: "same", tripId: String(a.trip._id), itemId: String(a.a) })] });
    const res = await request(app).post("/listens").set(authHeader("u2")).send({ events: [ev({ id: "same", tripId: String(b.trip._id), itemId: String(b.a) })] });
    expect(res.body.data.accepted).toBe(1);
    expect(await Listen.countDocuments()).toBe(2);
  });

  it.each([
    ["no events", { events: [] }],
    ["no body", {}],
    ["more than 200 events", { events: Array.from({ length: 201 }, (_, i) => ev({ id: `e${i}`, tripId: "a".repeat(24), itemId: "b".repeat(24) })) }],
    ["bad event type", { events: [ev({ tripId: "a".repeat(24), itemId: "b".repeat(24), event: "liked" })] }],
    ["bad trip id", { events: [ev({ tripId: "nope", itemId: "b".repeat(24) })] }],
    ["bad timestamp", { events: [ev({ tripId: "a".repeat(24), itemId: "b".repeat(24), at: "yesterday" })] }],
    ["unknown field", { events: [ev({ tripId: "a".repeat(24), itemId: "b".repeat(24), extra: 1 })] }],
  ])("rejects %s with VALIDATION_FAILED", async (_name, payload) => {
    const res = await request(app).post("/listens").set(authHeader("u1")).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});
