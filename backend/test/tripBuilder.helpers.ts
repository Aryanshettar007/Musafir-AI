import { encodePolyline, type LatLng } from "../src/geo";
import type { GPlace } from "../src/clients/maps";
import type { WikipediaClient, WikiHit } from "../src/clients/wikipedia";
import type { GenerateJsonRequest } from "../src/clients/gemini";
import { toPoint } from "../src/models/point";
import { Trip } from "../src/models/trip.model";

// A straight 60 km road going east along latitude 12 (about 0.5505 degrees of longitude).
const LNG_PER_KM = 1 / (111.32 * Math.cos((12 * Math.PI) / 180));
export const at = (km: number, offsetM = 0): LatLng => ({ lat: 12 + offsetM / 111_000, lng: 77 + km * LNG_PER_KM });
export const ROUTE_POINTS: LatLng[] = Array.from({ length: 61 }, (_, i) => at(i));
export const ROUTE = { polyline: encodePolyline(ROUTE_POINTS), distanceM: 60_000, durationS: 3600 };

export const gplace = (id: string, name: string, km: number, extra: Partial<GPlace> = {}): GPlace => ({
  id, name, location: at(km, 300), primaryType: "tourist_attraction", types: ["tourist_attraction"], userRatingCount: 1500, ...extra,
});

export const PLACES: GPlace[] = [
  gplace("g-fort", "Alpha Fort", 20, { primaryType: "historical_landmark", types: ["historical_landmark", "tourist_attraction"] }),
  gplace("g-temple", "Beta Temple", 32, { primaryType: "hindu_temple", types: ["hindu_temple"] }),
  gplace("g-dosa", "Dosa Corner", 38, { primaryType: "restaurant", types: ["restaurant", "food"] }),
  gplace("g-lake", "Gamma Lake", 46, { primaryType: "lake", types: ["lake", "tourist_attraction"] }),
];

export const WIKI: WikiHit[] = [
  { pageId: 101, title: "Alpha Fort", location: at(20, 300), description: "Fort in Karnataka, India", length: 20000 },
  { pageId: 102, title: "Townville", location: at(26, 200), description: "Town in Test district, Karnataka", length: 30000 },
  { pageId: 103, title: "Gamma Lake", location: at(46, 300), description: "Lake in Karnataka", length: 9000 },
  { pageId: 104, title: "Alpha Fort metro station", location: at(20, 300), description: "Metro station in Test", length: 900 },
];

export function fakeWikipedia(opts: { hits?: WikiHit[]; extracts?: Record<number, string> } = {}): WikipediaClient & { extractCalls: number[]; searchCalls: string[] } {
  const hits = opts.hits ?? WIKI;
  const extractCalls: number[] = [];
  const searchCalls: string[] = [];
  return {
    extractCalls,
    searchCalls,
    // Every sample returns the whole list; discover dedupes by page id.
    geosearch: async () => hits,
    searchByName: async ({ query }) => {
      searchCalls.push(query);
      return [];
    },
    extract: async ({ pageId }) => {
      extractCalls.push(pageId);
      const text = opts.extracts?.[pageId] ?? `Plain text facts about page ${pageId}. It is an old and well known place with a long history and many visitors every year.`;
      return { pageId, title: `Page ${pageId}`, url: `https://en.wikipedia.org/wiki/Page_${pageId}`, text };
    },
  };
}

// Scripted Gemini for the pipeline: the curator picks the first candidate of every slot (plus a town per slot),
// stories are `budget` words long, so they pass the script check.
export function pipelineGemini(overrides: { story?: (req: GenerateJsonRequest<unknown>) => unknown; curate?: (req: GenerateJsonRequest<unknown>) => unknown } = {}) {
  return (req: GenerateJsonRequest<unknown>): unknown => {
    if (req.purpose === "curate") return overrides.curate?.(req) ?? curatorAnswer(req.prompt);
    if (req.purpose === "story") return overrides.story?.(req) ?? story(req.prompt);
    throw new Error(`unexpected purpose ${req.purpose}`);
  };
}

export function story(prompt: string) {
  const budget = Number(/about (\d+) words/.exec(prompt)?.[1] ?? 100);
  const place = /PLACES: ([^\n;]+)/.exec(prompt)?.[1] ?? "the trip";
  return { title: `Story of ${place}`, script: Array.from({ length: budget }, (_, i) => (i === 0 ? place.split(" ")[0] : "word")).join(" ") + ".", factsUsed: ["a fact"] };
}

export function curatorAnswer(prompt: string) {
  const picks: Array<{ slot: number; candidateId: string; type: string; focus: string }> = [];
  const seen = new Set<string>();
  for (const m of prompt.matchAll(/^\s+(s(\d+)([ct])(\d+)): .*? \| (\w+)/gm)) {
    const [, id, slot, ct, , kind] = m;
    const key = `${slot}${ct === "t" ? "t" : "c"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = kind === "food" ? "food" : kind === "episode" ? "episode" : kind === "town" ? "town-welcome" : kind === "region" ? "long-form" : "story";
    picks.push({ slot: Number(slot), candidateId: id, type, focus: "general" });
  }
  return { picks };
}

export async function newTrip(userId: string, over: Record<string, unknown> = {}) {
  return Trip.create({
    userId,
    status: "building",
    stage: "discovering",
    origin: { label: "Start", location: toPoint(at(0)) },
    destination: { label: "End", location: toPoint(at(60)), placeId: "dest" },
    prefs: { language: "en-IN", voice: "Deepak", voiceGender: "male", interests: ["history", "food"], musicMode: "rj" },
    route: ROUTE,
    ...over,
  });
}
