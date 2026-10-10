import type { GPlace, MapsClient } from "../clients/maps";
import { createLimiter } from "../clients/limiter";
import type { WikiHit, WikipediaClient } from "../clients/wikipedia";
import { encodePolyline, sampleRoute, sliceRoute, type LatLng, type RouteIndex } from "../geo";
import {
  FOOD_MAX_PAGES, FOOD_QUERY, FOOD_SEGMENT_M, MAPS_CONCURRENCY, NEARBY_MAX_RESULTS, NEARBY_RADIUS_M, NEARBY_SPLIT_OFFSET_FACTOR,
  NEARBY_SPLIT_RADIUS_FACTOR, NEARBY_STEP_M, SIGHT_TYPES, WIKI_LIMIT, WIKI_RADIUS_M, WIKI_STEP_M,
} from "./rules";

export interface DiscoveryStats {
  nearby: number;
  nearbySplits: number;
  textSearch: number;
  wikipedia: number;
  failedCalls: number;
}

// Raw, deduplicated results of the three discovery strategies. Serialisable: tests and tuning scripts save it.
export interface Discovery {
  google: GPlace[];
  wiki: WikiHit[];
  stats: DiscoveryStats;
}

export interface DiscoverDeps {
  maps: MapsClient;
  wikipedia: WikipediaClient;
  // Per-call failures are logged here and skipped; discovery only fails when nothing at all came back from Google.
  warn?: (message: string) => void;
}

const R = 6_371_000;

// A point `dxM` east and `dyM` north of `p` (flat approximation, fine for a few km).
export function offsetPoint(p: LatLng, dxM: number, dyM: number): LatLng {
  const dLat = (dyM / R) * (180 / Math.PI);
  const dLng = (dxM / (R * Math.cos((p.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

// The 100 km (FOOD_SEGMENT_M) segments food search runs over; a short tail merges into the previous segment.
export function foodSegments(totalM: number): Array<[number, number]> {
  const count = Math.max(1, Math.floor(totalM / FOOD_SEGMENT_M + 0.25));
  const len = totalM / count;
  return Array.from({ length: count }, (_, i): [number, number] => [i * len, (i + 1) * len]);
}

export async function discover(deps: DiscoverDeps, route: RouteIndex): Promise<Discovery> {
  const { maps, wikipedia } = deps;
  const warn = deps.warn ?? (() => {});
  const stats: DiscoveryStats = { nearby: 0, nearbySplits: 0, textSearch: 0, wikipedia: 0, failedCalls: 0 };
  const limiter = createLimiter({ concurrency: MAPS_CONCURRENCY });
  const google = new Map<string, GPlace>();
  const add = (places: GPlace[]) => places.forEach((p) => google.set(p.id, p));
  let googleOk = 0;

  async function guarded<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const v = await limiter.run(fn);
      googleOk++;
      return v;
    } catch (e) {
      stats.failedCalls++;
      warn(`${label} failed: ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }

  // Sights: Nearby Search every 15 km. Nearby returns at most 20 places, so a full call is repeated once as four
  // overlapping circles (0.75 r, centres r/2 away along the diagonals): highways stay cheap, dense cities get more.
  const nearbyTasks = sampleRoute(route, NEARBY_STEP_M).map(async (center) => {
    stats.nearby++;
    const places = await guarded("nearby", () =>
      maps.searchNearby({ center, radiusM: NEARBY_RADIUS_M, includedTypes: SIGHT_TYPES, maxResults: NEARBY_MAX_RESULTS }),
    );
    if (!places) return;
    add(places);
    if (places.length < NEARBY_MAX_RESULTS) return;
    const d = (NEARBY_RADIUS_M * NEARBY_SPLIT_OFFSET_FACTOR) / Math.SQRT2;
    for (const [dx, dy] of [[d, d], [-d, d], [d, -d], [-d, -d]] as const) {
      stats.nearbySplits++;
      const more = await guarded("nearby-split", () =>
        maps.searchNearby({
          center: offsetPoint(center, dx, dy),
          radiusM: NEARBY_RADIUS_M * NEARBY_SPLIT_RADIUS_FACTOR,
          includedTypes: SIGHT_TYPES,
          maxResults: NEARBY_MAX_RESULTS,
        }),
      );
      if (more) add(more);
    }
  });

  // Food: Text Search along each 100 km segment (one query over a long route returns results bunched at its ends).
  const foodTasks = foodSegments(route.totalM).map(async ([from, to]) => {
    const alongPolyline = encodePolyline(sliceRoute(route, from, to));
    let pageToken: string | undefined;
    for (let page = 0; page < FOOD_MAX_PAGES; page++) {
      stats.textSearch++;
      const r = await guarded("text-search", () => maps.searchText({ query: FOOD_QUERY, alongPolyline, pageToken }));
      if (!r) return;
      add(r.places);
      pageToken = r.nextPageToken;
      if (!pageToken) return;
    }
  });

  // Wikipedia: one at a time (the client serialises). Runs alongside the Google calls.
  const wiki = new Map<number, WikiHit>();
  const wikiTask = (async () => {
    for (const center of sampleRoute(route, WIKI_STEP_M)) {
      stats.wikipedia++;
      try {
        for (const hit of await wikipedia.geosearch({ center, radiusM: WIKI_RADIUS_M, limit: WIKI_LIMIT })) wiki.set(hit.pageId, hit);
      } catch (e) {
        stats.failedCalls++;
        warn(`wikipedia geosearch failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  })();

  await Promise.all([...nearbyTasks, ...foodTasks, wikiTask]);
  if (googleOk === 0) throw new Error("Google Places returned nothing: every discovery call failed");
  return { google: [...google.values()], wiki: [...wiki.values()], stats };
}
