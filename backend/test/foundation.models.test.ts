import { Router } from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { Listen } from "../src/models/listen.model";
import { Place } from "../src/models/place.model";
import { toPoint } from "../src/models/point";
import { Story } from "../src/models/story.model";
import { Trip } from "../src/models/trip.model";
import { authHeader, fakeVerifyIdToken, memoryStorage } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";

beforeAll(async () => {
  await startMongo();
  await Promise.all([Place, Story, Trip, Listen].map((m) => m.init()));
});
afterAll(stopMongo);
beforeEach(clearCollections);

const point = toPoint({ lat: 12.4, lng: 76.7 });

describe("models", () => {
  it("places: unique googlePlaceId and wikipedia.pageId, but many places may have neither", async () => {
    await Place.create({ kind: "poi", name: "A", location: point, googlePlaceId: "g1", wikipedia: { pageId: 1 } });
    await Place.create({ kind: "poi", name: "B", location: point });
    await Place.create({ kind: "town", name: "C", location: point });
    await expect(Place.create({ kind: "poi", name: "D", location: point, googlePlaceId: "g1" })).rejects.toThrow(/duplicate/i);
    await expect(Place.create({ kind: "town", name: "E", location: point, wikipedia: { pageId: 1 } })).rejects.toThrow(/duplicate/i);
  });

  it("places: supports geo queries through the 2dsphere index", async () => {
    await Place.create({ kind: "poi", name: "Near", location: point });
    await Place.create({ kind: "poi", name: "Far", location: toPoint({ lat: 19, lng: 72.8 }) });
    const near = await Place.find({ location: { $near: { $geometry: point, $maxDistance: 5_000 } } });
    expect(near.map((p) => p.name)).toEqual(["Near"]);
  });

  it("stories: cacheKey is unique", async () => {
    const story = {
      cacheKey: "v1|story|x|kn-IN|Girish|history|left", type: "story", language: "kn-IN", voice: "Girish", focus: "history",
      side: "left", title: "t", script: "s", audio: { storageKey: "k", bytes: 1, durationS: 1 },
      models: { llm: "m", tts: "timbre-v2.5" }, promptVersion: 1,
    };
    await Story.create(story);
    await expect(Story.create(story)).rejects.toThrow(/duplicate/i);
  });

  it("trips: stores a sponsored item with its own audio and no story", async () => {
    const trip = await Trip.create({
      userId: "u1",
      origin: { label: "A", location: point },
      destination: { label: "B", location: point, placeId: "p" },
      prefs: { language: "kn-IN", voice: "Girish", voiceGender: "male", interests: ["history"], musicMode: "rj" },
      route: { polyline: "abc", distanceM: 1000, durationS: 60 },
      items: [
        {
          type: "sponsored", status: "ready", targetSeconds: 20, anchorRouteDistanceM: 500, title: "Ad", transcript: "text",
          audio: { storageKey: "sponsors/x.mp3", bytes: 10, durationS: 20 }, sponsor: { slug: "corner-house", name: "Corner House" },
        },
      ],
    });
    expect(trip.status).toBe("building");
    expect(trip.stage).toBe("discovering");
    expect(trip.items[0].sponsor?.name).toBe("Corner House");
    expect(trip.items[0].storyId).toBeUndefined();
  });

  it("listens: (userId, clientEventId) is unique", async () => {
    const id = new mongoose.Types.ObjectId();
    const listen = { userId: "u1", clientEventId: "e1", tripId: id, itemId: id, event: "completed", at: new Date() };
    await Listen.create(listen);
    await expect(Listen.create(listen)).rejects.toThrow(/duplicate/i);
    await Listen.create({ ...listen, userId: "u2" });
  });
});

describe("createApp routers", () => {
  const router = Router();
  router.get("/ping", (_req, res) => void res.json({ success: true, data: "pong" }));
  const app = createApp({ verifyIdToken: fakeVerifyIdToken, storage: memoryStorage(), routers: [{ path: "/extra", router }] });

  it("mounts feature routers behind auth", async () => {
    expect((await request(app).get("/extra/ping")).status).toBe(401);
    const res = await request(app).get("/extra/ping").set(authHeader("u1"));
    expect(res.body).toEqual({ success: true, data: "pong" });
  });

  it("keeps the 404 envelope for unknown paths", async () => {
    const res = await request(app).get("/extra/nope").set(authHeader("u1"));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
