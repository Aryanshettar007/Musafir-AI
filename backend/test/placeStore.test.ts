import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NameHit, WikipediaClient } from "../src/clients/wikipedia";
import { Place } from "../src/models/place.model";
import { labelTokens } from "../src/pipeline/match";
import type { Candidate, PlannedItem } from "../src/pipeline/types";
import { createPlaceStore } from "../src/services/trip/placeStore";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";

beforeAll(async () => {
  await startMongo();
  await Place.init();
});
afterAll(stopMongo);
beforeEach(clearCollections);

const palace: Candidate = {
  key: "gPalace", kind: "poi", name: "Bengaluru Palace", location: { lat: 12.9987, lng: 77.592 }, googlePlaceId: "gPalace",
  primaryType: "museum", types: ["museum"], ratings: 5_000, interests: [], distanceFromRouteM: 600, routeDistanceM: 0,
  side: "left", historic: true, inEdge: false, score: 5, heard: false,
};
const town: Candidate = {
  key: "wiki:77", kind: "town", name: "Adagodi", location: { lat: 12.99, lng: 77.6 }, types: [], ratings: 0,
  article: { pageId: 77, title: "Adagodi", location: { lat: 12.99, lng: 77.6 }, description: "Village in Shimoga district" },
  interests: [], distanceFromRouteM: 500, routeDistanceM: 1000, side: "right", historic: false, inEdge: false, score: 3, heard: false,
};
const story = (c: Candidate, type: PlannedItem["type"] = "story"): PlannedItem => ({
  type, candidate: c, focus: "general", side: "left", targetSeconds: 45, anchorRouteDistanceM: c.routeDistanceM, score: c.score, title: c.name,
});

function wiki(search: (query: string) => NameHit[]) {
  const queries: string[] = [];
  const client: WikipediaClient = {
    geosearch: async () => [],
    searchByName: async ({ query }) => {
      queries.push(query);
      return search(query);
    },
    extract: async ({ pageId }) => ({ pageId, title: `Page ${pageId}`, url: `https://en.wikipedia.org/?curid=${pageId}`, text: `Facts of page ${pageId}.` }),
  };
  return { client, queries };
}

const exclude = labelTokens("Bangalore Palace, Bengaluru", "Bull Temple, Basavanagudi, Bengaluru");

describe("place store facts", () => {
  it("searches the bare name when the name with the town finds nothing, and takes an exact title without coordinates", async () => {
    const w = wiki((q) => (q === "Bengaluru Palace" ? [{ pageId: 5, title: "Bengaluru Palace", description: "Royal palace in India" }] : []));
    const store = createPlaceStore({ wikipedia: w.client, exclude, borrowFor: "food" });
    const out = await store.resolveItems([story(palace)], [town]);
    expect(w.queries).toEqual(["Bengaluru Palace Adagodi", "Bengaluru Palace"]);
    expect(out.resolved.map((r) => r.keys)).toEqual([["gPalace"]]);
    expect((await Place.findOne({ googlePlaceId: "gPalace" }).lean())?.facts?.text).toBe("Facts of page 5.");
  });

  it("never takes the city's own article", async () => {
    const w = wiki(() => [{ pageId: 9, title: "Bengaluru", location: { lat: 12.97, lng: 77.59 }, description: "Capital of Karnataka, India" }]);
    const store = createPlaceStore({ wikipedia: w.client, exclude, borrowFor: "food" });
    const out = await store.resolveItems([story(palace)], [town]);
    expect(out.dropped.map((d) => d.title)).toEqual(["Bengaluru Palace"]); // local: a sight does not borrow a town
  });

  it("writes a famous place no article matched from knowledge, before borrowing", async () => {
    const famous: Candidate = { ...palace, ratings: 100_874 };
    const store = createPlaceStore({ wikipedia: wiki(() => []).client, exclude });
    const out = await store.resolveItems([story(famous)], [town]);
    expect(out.resolved.map((r) => r.keys)).toEqual([["gPalace"]]); // no town added
    expect(store.stats.known).toBe(1);
  });

  it("lets only food borrow a town's facts on a local trip, and anything between cities", async () => {
    const none = () => [];
    const cafe: Candidate = { ...palace, key: "gCafe", googlePlaceId: "gCafe", name: "Some Tiffin Room", kind: "food" };
    const local = await createPlaceStore({ wikipedia: wiki(none).client, exclude, borrowFor: "food" }).resolveItems([story(cafe, "food")], [town]);
    expect(local.resolved.map((r) => r.keys)).toEqual([["gCafe", "wiki:77"]]);
    const intercity = await createPlaceStore({ wikipedia: wiki(none).client, exclude }).resolveItems([story(palace)], [town]);
    expect(intercity.resolved.map((r) => r.keys)).toEqual([["gPalace", "wiki:77"]]);
  });
});
