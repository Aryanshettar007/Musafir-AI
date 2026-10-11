import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { MapsClient } from "../src/clients/maps";
import { UpstreamError } from "../src/clients/upstream";
import { tripRouters } from "../src/routes/trips.routes";
import { authHeader, fakeMaps, fakeVerifyIdToken, memoryStorage } from "./helpers/fakes";

const storage = memoryStorage();
const appWith = (maps: MapsClient) =>
  createApp({
    verifyIdToken: fakeVerifyIdToken,
    storage,
    routers: tripRouters({ maps, builder: { start: async () => {} }, storage, limits: { tripsPerDay: 10, maxRouteKm: 1200 } }),
  });

const suggestion = (i: number) => ({ placeId: `p${i}`, primaryText: `Place ${i}`, secondaryText: "Karnataka, India" });
const TOKEN = "123e4567-e89b-42d3-a456-426614174000";

describe("GET /places/autocomplete", () => {
  it("requires authentication", async () => {
    expect((await request(appWith(fakeMaps())).get("/places/autocomplete?q=mysore")).status).toBe(401);
  });

  it("returns at most five suggestions and passes the bias and session token to Maps", async () => {
    const seen: unknown[] = [];
    const maps = fakeMaps({ autocomplete: async (req) => (seen.push(req), Array.from({ length: 8 }, (_, i) => suggestion(i))) });
    const res = await request(appWith(maps)).get(`/places/autocomplete?q=mysore%20pal&lat=12.97&lng=77.59&sessionToken=${TOKEN}`).set(authHeader("u1"));
    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(5);
    expect(res.body.data.suggestions[0]).toEqual({ placeId: "p0", primaryText: "Place 0", secondaryText: "Karnataka, India" });
    expect(seen[0]).toEqual({ input: "mysore pal", bias: { lat: 12.97, lng: 77.59 }, sessionToken: TOKEN });
  });

  it("works without a bias or session token", async () => {
    const seen: unknown[] = [];
    const maps = fakeMaps({ autocomplete: async (req) => (seen.push(req), []) });
    const res = await request(appWith(maps)).get("/places/autocomplete?q=ab").set(authHeader("u1"));
    expect(res.body).toEqual({ success: true, data: { suggestions: [] } });
    expect(seen[0]).toEqual({ input: "ab", bias: undefined, sessionToken: undefined });
  });

  it.each([
    ["missing q", "/places/autocomplete"],
    ["q too short", "/places/autocomplete?q=a"],
    ["q too long", `/places/autocomplete?q=${"a".repeat(101)}`],
    ["lat without lng", "/places/autocomplete?q=mysore&lat=12"],
    ["lat out of range", "/places/autocomplete?q=mysore&lat=100&lng=77"],
    ["session token not a uuid", "/places/autocomplete?q=mysore&sessionToken=abc"],
  ])("rejects %s with VALIDATION_FAILED", async (_name, url) => {
    const res = await request(appWith(fakeMaps())).get(url).set(authHeader("u1"));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns UPSTREAM_UNAVAILABLE when Maps fails", async () => {
    const maps = fakeMaps({ autocomplete: async () => { throw new UpstreamError("maps", 503, "down", true); } });
    const res = await request(appWith(maps)).get("/places/autocomplete?q=mysore").set(authHeader("u1"));
    expect([res.status, res.body.error.code]).toEqual([502, "UPSTREAM_UNAVAILABLE"]);
  });
});
