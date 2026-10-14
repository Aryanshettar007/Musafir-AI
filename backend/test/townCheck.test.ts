import { describe, expect, it } from "vitest";
import { UpstreamError } from "../src/clients/upstream";
import type { GPlace } from "../src/clients/maps";
import type { Candidate } from "../src/pipeline/types";
import { createTownCheck } from "../src/services/trip/townCheck";
import { fakeMaps } from "./helpers/fakes";

// Belavanaki: a village in Gadag district that Wikipedia places at Bengaluru's Majestic.
const town = (name: string): Candidate => ({
  key: `wiki:${name}`, kind: "town", name, location: { lat: 12.9779, lng: 77.5688 }, types: [], ratings: 0, interests: [],
  distanceFromRouteM: 0, routeDistanceM: 0, side: "left", historic: false, inEdge: false, score: 3, heard: false,
});
const place = (lat: number, lng: number): GPlace => ({ id: `g${lat}`, name: "x", location: { lat, lng }, types: ["locality"] });

describe("town check", () => {
  it("rejects a town Google finds only far from where Wikipedia puts it", async () => {
    const queries: string[] = [];
    const check = createTownCheck(fakeMaps({ searchText: async (req) => (queries.push(req.query), { places: [place(15.75, 75.83)] }) }));
    expect(await check(town("Belavanaki"))).toBe(false);
    expect(queries).toEqual(["Belavanaki"]);
  });

  it("accepts a town Google finds near the Wikipedia point, and one Google does not know", async () => {
    expect(await createTownCheck(fakeMaps({ searchText: async () => ({ places: [place(15.75, 75.83), place(12.99, 77.55)] }) }))(town("Rajajinagar"))).toBe(true);
    expect(await createTownCheck(fakeMaps({ searchText: async () => ({ places: [] }) }))(town("Tinyhalli"))).toBe(true);
  });

  it("searches the bare name and asks Google once per town", async () => {
    const queries: string[] = [];
    const check = createTownCheck(fakeMaps({ searchText: async (req) => (queries.push(req.query), { places: [] }) }));
    await check(town("Kadoli, Karnataka"));
    await check(town("Kadoli, Karnataka"));
    expect(queries).toEqual(["Kadoli"]);
  });

  it("keeps the town when Google can't be asked", async () => {
    const warnings: string[] = [];
    const check = createTownCheck(fakeMaps({ searchText: async () => { throw new UpstreamError("maps", 503, "Google Maps down", true); } }), (m) => warnings.push(m));
    expect(await check(town("Mandya"))).toBe(true);
    expect(warnings[0]).toMatch(/Mandya/);
  });
});
