import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { UpstreamError } from "../src/clients/upstream";
import { Story } from "../src/models/story.model";
import { toPoint } from "../src/models/point";
import { Trip } from "../src/models/trip.model";
import { User } from "../src/models/user.model";
import { tripRouters } from "../src/routes/trips.routes";
import { authHeader, fakeMaps, fakeVerifyIdToken, memoryStorage } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";
import { at, newTrip, ROUTE } from "./tripBuilder.helpers";

const start = vi.fn(async (_id: string) => {});
let maps = fakeMaps({ computeRoute: async () => ROUTE });
const storage = memoryStorage();
let limits = { tripsPerDay: 10, maxRouteKm: 1200 };

const app = () =>
  createApp({
    verifyIdToken: fakeVerifyIdToken,
    storage,
    routers: tripRouters({ maps, builder: { start }, storage, limits }),
  });

const body = {
  origin: { lat: 12.97, lng: 77.59, label: "Current location" },
  destination: { placeId: "ChIJdest", label: "Mysore Palace" },
};

beforeAll(async () => {
  await startMongo();
  await Trip.init();
});
afterAll(async () => {
  await stopMongo();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await clearCollections();
  start.mockClear();
  maps = fakeMaps({ computeRoute: async () => ROUTE });
  limits = { tripsPerDay: 10, maxRouteKm: 1200 };
  await User.create({ firebaseUid: "u1", gender: "male", language: "en-IN", voiceGender: "male", voice: "Deepak", interests: ["history", "food"], musicMode: "rj" });
});

describe("POST /trips", () => {
  it("requires authentication", async () => {
    expect((await request(app()).post("/trips").send(body)).status).toBe(401);
  });

  it("starts a trip: 202, saved as building, builder started", async () => {
    const res = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { tripId: expect.stringMatching(/^[a-f0-9]{24}$/), status: "building" } });
    expect(start).toHaveBeenCalledWith(res.body.data.tripId);
    const t = (await Trip.findById(res.body.data.tripId).lean())!;
    expect(t).toMatchObject({ userId: "u1", status: "building", stage: "discovering" });
    expect(t.origin.label).toBe("Current location");
    expect(t.origin.location.coordinates).toEqual([77.59, 12.97]);
    expect(t.destination).toMatchObject({ label: "Mysore Palace", placeId: "ChIJdest" });
    // The destination point comes from the last polyline point.
    expect(t.destination.location.coordinates[0]).toBeCloseTo(at(60).lng, 3);
    expect(t.route).toMatchObject({ distanceM: 60_000, durationS: 3600 });
    expect(t.prefs).toMatchObject({ language: "en-IN", voice: "Deepak", voiceGender: "male", interests: ["history", "food"], musicMode: "rj" });
  });

  it("applies prefs on top of the profile like PATCH /me, without changing the profile", async () => {
    const res = await request(app()).post("/trips").set(authHeader("u1")).send({ ...body, prefs: { language: "kn-IN", interests: ["nature"] } });
    expect(res.status).toBe(202);
    const t = (await Trip.findById(res.body.data.tripId).lean())!;
    // Deepak was the default English voice, so switching to Kannada moves to Girish (the same rule as /me).
    expect(t.prefs).toMatchObject({ language: "kn-IN", voice: "Girish", interests: ["nature"] });
    const user = (await User.findOne({ firebaseUid: "u1" }).lean())!;
    expect(user).toMatchObject({ language: "en-IN", voice: "Deepak", interests: ["history", "food"] });
  });

  it("accepts selected moods at root and inside prefs, mapping to trip prefs and moods", async () => {
    const res = await request(app()).post("/trips").set(authHeader("u1")).send({ ...body, moods: ["adventure", "nature"] });
    expect(res.status).toBe(202);
    const t = (await Trip.findById(res.body.data.tripId).lean())!;
    expect(t.prefs.interests).toEqual(["adventure", "nature"]);
    expect(t.moods).toEqual(["adventure", "nature"]);
    expect(t.prefs.moods).toEqual(["adventure", "nature"]);

    // Mark first trip done so user can create another
    await Trip.deleteMany({});

    // Moods array inside prefs
    const res2 = await request(app()).post("/trips").set(authHeader("u1")).send({ ...body, prefs: { moods: ["spirituality"] } });
    expect(res2.status).toBe(202);
    const t2 = (await Trip.findById(res2.body.data.tripId).lean())!;
    expect(t2.prefs.interests).toEqual(["spirituality"]);
    expect(t2.moods).toEqual(["spirituality"]);
    expect(t2.prefs.moods).toEqual(["spirituality"]);
  });

  it("accepts a place id as the origin and takes its point from the route start", async () => {
    const res = await request(app()).post("/trips").set(authHeader("u1")).send({ origin: { placeId: "ChIJorigin", label: "Bengaluru" }, destination: body.destination });
    expect(res.status).toBe(202);
    const t = (await Trip.findById(res.body.data.tripId).lean())!;
    expect(t.origin).toMatchObject({ label: "Bengaluru", placeId: "ChIJorigin" });
    expect(t.origin.location.coordinates[0]).toBeCloseTo(at(0).lng, 3);
  });

  it.each([
    ["no body", {}],
    ["no destination", { origin: body.origin }],
    ["unknown field", { ...body, extra: 1 }],
    ["bad latitude", { ...body, origin: { lat: 95, lng: 77 } }],
    ["unknown interest", { ...body, prefs: { interests: ["nope"] } }],
    ["unknown pref key", { ...body, prefs: { name: "x" } }],
    ["destination without label", { origin: body.origin, destination: { placeId: "x" } }],
  ])("rejects %s with VALIDATION_FAILED", async (_name, payload) => {
    const res = await request(app()).post("/trips").set(authHeader("u1")).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(start).not.toHaveBeenCalled();
  });

  it("reports voice errors like /me", async () => {
    const unknown = await request(app()).post("/trips").set(authHeader("u1")).send({ ...body, prefs: { voice: "Nobody" } });
    expect([unknown.status, unknown.body.error.code]).toEqual([400, "UNKNOWN_VOICE"]);
    const mismatch = await request(app()).post("/trips").set(authHeader("u1")).send({ ...body, prefs: { voice: "Deepak", voiceGender: "female" } });
    expect([mismatch.status, mismatch.body.error.code]).toEqual([400, "VOICE_GENDER_MISMATCH"]);
  });

  it("returns PROFILE_NOT_FOUND before onboarding", async () => {
    const res = await request(app()).post("/trips").set(authHeader("nobody")).send(body);
    expect([res.status, res.body.error.code]).toEqual([404, "PROFILE_NOT_FOUND"]);
  });

  it("allows one building trip per user and tells the app which one", async () => {
    const building = await newTrip("u1");
    const res = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "TRIP_IN_PROGRESS", details: { tripId: String(building._id) } });
    await Trip.updateOne({ _id: building._id }, { status: "ready" });
    expect((await request(app()).post("/trips").set(authHeader("u1")).send(body)).status).toBe(202);
  });

  it("lets only one of two simultaneous requests start a trip (unique index), the other gets TRIP_IN_PROGRESS", async () => {
    // Both requests pass the in-progress check before either saves: routing waits until both have asked for a route.
    let arrived = 0;
    let release!: () => void;
    const bothRouting = new Promise<void>((r) => (release = r));
    maps = fakeMaps({
      computeRoute: async () => {
        if (++arrived === 2) release();
        await bothRouting;
        return ROUTE;
      },
    });
    const a = app();
    const [r1, r2] = await Promise.all([1, 2].map(() => request(a).post("/trips").set(authHeader("u1")).send(body)));
    expect(arrived).toBe(2);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([202, 409]);
    const won = r1.status === 202 ? r1 : r2, lost = r1.status === 202 ? r2 : r1;
    expect(lost.body.error).toMatchObject({ code: "TRIP_IN_PROGRESS", details: { tripId: won.body.data.tripId } });
    expect(await Trip.countDocuments({ userId: "u1" })).toBe(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("limits trips per day", async () => {
    limits = { tripsPerDay: 2, maxRouteKm: 1200 };
    await newTrip("u1", { status: "ready" });
    await newTrip("u1", { status: "failed" });
    await newTrip("u2", { status: "ready" }); // other users don't count
    const res = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect([res.status, res.body.error.code]).toEqual([429, "TRIP_LIMIT_REACHED"]);
    // createdAt is immutable in mongoose, so go through the driver.
    await Trip.collection.updateMany({ userId: "u1" }, { $set: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    expect((await request(app()).post("/trips").set(authHeader("u1")).send(body)).status).toBe(202);
  });

  it("returns ROUTE_NOT_FOUND, ROUTE_TOO_LONG and UPSTREAM_UNAVAILABLE for routing problems", async () => {
    maps = fakeMaps({ computeRoute: async () => null });
    const none = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect([none.status, none.body.error.code]).toEqual([422, "ROUTE_NOT_FOUND"]);

    maps = fakeMaps({ computeRoute: async () => ({ ...ROUTE, distanceM: 1_300_000 }) });
    const long = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect([long.status, long.body.error.code]).toEqual([422, "ROUTE_TOO_LONG"]);

    maps = fakeMaps({ computeRoute: async () => { throw new UpstreamError("maps", 503, "down", true); } });
    const down = await request(app()).post("/trips").set(authHeader("u1")).send(body);
    expect([down.status, down.body.error.code]).toEqual([502, "UPSTREAM_UNAVAILABLE"]);
    expect(await Trip.countDocuments()).toBe(0);
    expect(start).not.toHaveBeenCalled();
  });

  it("POST /trips/preview returns alternative routes without creating a trip", async () => {
    maps = fakeMaps({
      computeRoutes: async () => [
        { id: "route_0", ...ROUTE, description: "Fastest via NH 44" },
        { id: "route_1", ...ROUTE, distanceM: 65_000, durationS: 3900, description: "Alternative via Bellary Rd" },
      ],
    });
    const res = await request(app())
      .post("/trips/preview")
      .set(authHeader("u1"))
      .send({ origin: { placeId: "p_origin" }, destination: { placeId: "p_dest" } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].description).toBe("Fastest via NH 44");
    expect(res.body.data[1].description).toBe("Alternative via Bellary Rd");
    expect(await Trip.countDocuments()).toBe(0);
  });

  it("POST /trips accepts selectedRoute and builds the trip with it", async () => {
    const selectedRoute = {
      polyline: ROUTE.polyline,
      distanceM: 55_000,
      durationS: 3300,
      description: "Alternative via Bellary Rd",
    };
    const res = await request(app())
      .post("/trips")
      .set(authHeader("u1"))
      .send({ ...body, selectedRoute });
    expect(res.status).toBe(202);
    const trip = await Trip.findOne({ userId: "u1" });
    expect(trip?.route?.distanceM).toBe(55_000);
    expect(trip?.route?.durationS).toBe(3300);
  });
});

async function builtTrip() {
  const story = await Story.create({
    cacheKey: "k1", type: "story", placeIds: [], language: "en-IN", voice: "Deepak", focus: "general", side: "left", title: "Alpha Fort story",
    script: "A story.", factsUsed: [], audio: { storageKey: "stories/en-IN/s1.mp3", bytes: 123_000, durationS: 61.2 },
    models: { llm: "gemini-3.5-flash-lite", tts: "timbre-v2.5" }, promptVersion: 1,
  });
  const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const trigger = (m: number) => ({ location: toPoint(at(m / 1000)), radiusM: 400, routeDistanceM: m });
  return Trip.create({
    userId: "u1", status: "ready", stage: "done", builtAt: new Date(),
    origin: { label: "Start", location: toPoint(at(0)) }, destination: { label: "End", location: toPoint(at(60)), placeId: "dest" },
    prefs: { language: "en-IN", voice: "Deepak", voiceGender: "male", interests: ["history"], musicMode: "rj" },
    route: ROUTE,
    items: [
      { _id: ids[0], type: "story", status: "ready", focus: "history", side: "left", targetSeconds: 60, anchorRouteDistanceM: 30_000, title: "Alpha Fort", storyId: story._id, trigger: trigger(29_000) },
      { _id: ids[1], type: "sponsored", status: "ready", focus: "general", side: "right", targetSeconds: 20, anchorRouteDistanceM: 10_000, title: "Corner House ad", sponsor: { slug: "ch", name: "Corner House" },
        audio: { storageKey: "sponsors/ch/ad.mp3", bytes: 50_000, durationS: 20 }, transcript: "Ad", trigger: trigger(9_500) },
      { _id: ids[2], type: "story", status: "pending", focus: "general", side: "none", targetSeconds: 60, anchorRouteDistanceM: 45_000, title: "Pending one" },
      { _id: ids[3], type: "story", status: "failed", focus: "general", side: "none", targetSeconds: 60, anchorRouteDistanceM: 50_000, title: "Broken one", error: "boom" },
    ],
  });
}

describe("GET /trips/:id", () => {
  it("returns items in route order with signed URLs only on ready items", async () => {
    const trip = await builtTrip();
    const res = await request(app()).get(`/trips/${trip._id}`).set(authHeader("u1"));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({
      id: String(trip._id), status: "ready", progress: { ready: 2, failed: 1, total: 4 },
      origin: { label: "Start" }, destination: { label: "End" },
      prefs: { language: "en-IN", voice: "Deepak", interests: ["history"], musicMode: "rj" },
      route: { polyline: ROUTE.polyline, distanceM: 60_000, durationS: 3600 }, totalBytes: 173_000,
    });
    expect(d.builtAt).toBeTruthy();
    expect(d.items.map((i: { title: string }) => i.title)).toEqual(["Corner House ad", "Alpha Fort story", "Pending one", "Broken one"]);
    const [ad, fort, pending, failed] = d.items;
    expect(fort).toMatchObject({
      type: "story", status: "ready", side: "left", transcript: "A story.",
      trigger: { radiusM: 400, routeDistanceM: 29_000 },
      audio: { url: "https://cdn.example/stories/en-IN/s1.mp3?sig=test", durationS: 61.2, bytes: 123_000 },
    });
    expect(fort.trigger.lat).toBeCloseTo(12, 2);
    expect(ad).toMatchObject({ type: "sponsored", status: "ready", sponsor: { name: "Corner House" }, transcript: "Ad", audio: { url: "https://cdn.example/sponsors/ch/ad.mp3?sig=test" } });
    expect(pending).toEqual({ id: expect.any(String), type: "story", status: "pending", title: "Pending one", side: "none" });
    expect(failed.audio).toBeUndefined();
    expect(failed.error).toBeUndefined();
  });

  it("shows the failure of a failed trip and progress of a building one", async () => {
    const failed = await newTrip("u1", { status: "failed", stage: "done", failure: { code: "NOTHING_BUILT", message: "No item could be built." } });
    const f = await request(app()).get(`/trips/${failed._id}`).set(authHeader("u1"));
    expect(f.body.data).toMatchObject({ status: "failed", failure: { code: "NOTHING_BUILT" }, progress: { ready: 0, failed: 0, total: 0 }, items: [] });
    const building = await newTrip("u1");
    const b = await request(app()).get(`/trips/${building._id}`).set(authHeader("u1"));
    expect(b.body.data.status).toBe("building");
    expect(b.body.data.builtAt).toBeUndefined();
  });

  it("hides other users' trips and malformed ids behind TRIP_NOT_FOUND", async () => {
    const trip = await builtTrip();
    for (const url of [`/trips/${trip._id}`, "/trips/not-an-id", `/trips/${new Types.ObjectId()}`]) {
      const res = await request(app()).get(url).set(authHeader(url.includes(String(trip._id)) ? "u2" : "u1"));
      expect([res.status, res.body.error.code], url).toEqual([404, "TRIP_NOT_FOUND"]);
    }
  });
});

describe("GET /trips", () => {
  it("lists the user's trips newest first as summaries", async () => {
    const a = await newTrip("u1", { status: "ready" });
    await Trip.collection.updateOne({ _id: a._id }, { $set: { createdAt: new Date(Date.now() - 60_000) } });
    await builtTrip();
    await newTrip("u2");
    const res = await request(app()).get("/trips").set(authHeader("u1"));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ status: "ready", progress: { ready: 2, failed: 1, total: 4 }, origin: { label: "Start" }, destination: { label: "End" }, route: { distanceM: 60_000, durationS: 3600 } });
    expect(res.body.data[1].id).toBe(String(a._id));
    expect(Object.keys(res.body.data[0]).sort()).toEqual(["createdAt", "destination", "id", "origin", "progress", "route", "status"]);
    expect(JSON.stringify(res.body)).not.toContain("sig=");
  });

  it("honours and validates limit", async () => {
    for (let i = 0; i < 3; i++) await newTrip("u1", { status: "ready" });
    expect((await request(app()).get("/trips?limit=2").set(authHeader("u1"))).body.data).toHaveLength(2);
    for (const bad of ["0", "51", "abc"]) {
      const res = await request(app()).get(`/trips?limit=${bad}`).set(authHeader("u1"));
      expect([res.status, res.body.error.code], bad).toEqual([400, "VALIDATION_FAILED"]);
    }
  });
});
