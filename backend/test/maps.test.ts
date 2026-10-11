import { afterEach, describe, expect, it, vi } from "vitest";
import { mapsClient } from "../src/clients/maps";

const KEY = "test-maps-key";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// Stubs global fetch with a queue of responses and records what was sent.
function stubFetch(responses: Array<{ status?: number; json?: unknown; text?: string }>): Sent[] {
  const sent: Sent[] = [];
  const queue = [...responses];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = queue.shift() ?? { json: {} };
    const text = next.text ?? JSON.stringify(next.json ?? {});
    return new Response(text, { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const rawPlace = {
  id: "ChIJ1",
  displayName: { text: "Srirangapatna Fort" },
  location: { latitude: 12.42, longitude: 76.69 },
  primaryType: "historical_place",
  types: ["historical_place", "tourist_attraction"],
  userRatingCount: 12000,
};

describe("mapsClient", () => {
  it("computeRoute sends a DRIVE request with the route field mask and maps the answer", async () => {
    const sent = stubFetch([{ json: { routes: [{ distanceMeters: 138500, duration: "9060s", polyline: { encodedPolyline: "abc" } }] } }]);
    const route = await mapsClient({ apiKey: KEY }).computeRoute({ origin: { lat: 12.97, lng: 77.59 }, destination: { placeId: "P1" } });
    expect(route).toEqual({ distanceM: 138500, durationS: 9060, polyline: "abc" });
    expect(sent[0].url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(sent[0].headers["X-Goog-Api-Key"]).toBe(KEY);
    expect(sent[0].headers["X-Goog-FieldMask"]).toBe("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description");
    expect(sent[0].body).toEqual({
      origin: { location: { latLng: { latitude: 12.97, longitude: 77.59 } } },
      destination: { placeId: "P1" },
      travelMode: "DRIVE",
    });
  });

  it("computeRoutes sends computeAlternativeRoutes: true and parses route descriptions", async () => {
    stubFetch([{
      json: {
        routes: [
          { distanceMeters: 138500, duration: "9060s", polyline: { encodedPolyline: "abc" }, description: "NH 48" },
          { distanceMeters: 145000, duration: "9600s", polyline: { encodedPolyline: "def" }, description: "SH 17" },
        ],
      },
    }]);
    const routes = await mapsClient({ apiKey: KEY }).computeRoutes({ origin: { lat: 12.97, lng: 77.59 }, destination: { placeId: "P1" } });
    expect(routes).toHaveLength(2);
    expect(routes[0].description).toBe("NH 48");
    expect(routes[1].description).toBe("SH 17");
  });

  it("computeRoute returns null when Google finds no route", async () => {
    stubFetch([{ json: {} }]);
    expect(await mapsClient({ apiKey: KEY }).computeRoute({ origin: { placeId: "A" }, destination: { placeId: "B" } })).toBeNull();
  });

  it("searchNearby uses the cheap field mask (no rating, no editorialSummary) and a circle restriction", async () => {
    const sent = stubFetch([{ json: { places: [rawPlace] } }]);
    const places = await mapsClient({ apiKey: KEY }).searchNearby({
      center: { lat: 12.4, lng: 76.7 }, radiusM: 8000, includedTypes: ["museum"], maxResults: 50,
    });
    expect(places).toEqual([
      { id: "ChIJ1", name: "Srirangapatna Fort", location: { lat: 12.42, lng: 76.69 }, primaryType: "historical_place",
        types: ["historical_place", "tourist_attraction"], userRatingCount: 12000 },
    ]);
    const mask = sent[0].headers["X-Goog-FieldMask"];
    expect(mask).toBe("places.id,places.displayName,places.location,places.primaryType,places.types,places.userRatingCount");
    expect(mask).not.toMatch(/rating,|rating$|editorialSummary/);
    expect(sent[0].body).toEqual({
      includedTypes: ["museum"],
      maxResultCount: 20, // clamped: Google rejects more than 20
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: 12.4, longitude: 76.7 }, radius: 8000 } },
    });
  });

  it("searchText searches along a polyline and pages with nextPageToken", async () => {
    const sent = stubFetch([{ json: { places: [rawPlace], nextPageToken: "T2" } }, { json: { places: [] } }]);
    const maps = mapsClient({ apiKey: KEY });
    const first = await maps.searchText({ query: "famous local restaurants", alongPolyline: "enc" });
    expect(first.nextPageToken).toBe("T2");
    const second = await maps.searchText({ query: "famous local restaurants", alongPolyline: "enc", pageToken: "T2" });
    expect(second).toEqual({ places: [], nextPageToken: undefined });
    expect(sent[0].url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(sent[0].headers["X-Goog-FieldMask"]).toMatch(/,nextPageToken$/);
    expect(sent[0].body).toEqual({
      textQuery: "famous local restaurants", pageSize: 20, searchAlongRouteParameters: { polyline: { encodedPolyline: "enc" } },
    });
    expect(sent[1].body).toMatchObject({ pageToken: "T2", searchAlongRouteParameters: { polyline: { encodedPolyline: "enc" } } });
  });

  it("autocomplete is restricted to India, biased, keeps the session token and returns at most 5", async () => {
    const prediction = (i: number) => ({
      placePrediction: { placeId: `P${i}`, text: { text: `Full ${i}` }, structuredFormat: { mainText: { text: `Main ${i}` }, secondaryText: { text: `Sec ${i}` } } },
    });
    const sent = stubFetch([{ json: { suggestions: [{ queryPrediction: { text: { text: "q" } } }, ...[1, 2, 3, 4, 5, 6].map(prediction)] } }]);
    const out = await mapsClient({ apiKey: KEY }).autocomplete({ input: "Mysore pal", bias: { lat: 12.97, lng: 77.59 }, sessionToken: "S" });
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ placeId: "P1", primaryText: "Main 1", secondaryText: "Sec 1" });
    expect(sent[0].url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(sent[0].body).toEqual({
      input: "Mysore pal",
      includedRegionCodes: ["in"],
      locationBias: { circle: { center: { latitude: 12.97, longitude: 77.59 }, radius: 50_000 } },
      sessionToken: "S",
    });
  });

  it("retries 5xx, then reports a typed error that never contains the key", async () => {
    stubFetch([
      { status: 503, json: { error: { message: "backend error" } } },
      { status: 503, json: { error: { message: "backend error" } } },
      { status: 503, json: { error: { message: "backend error" } } },
      { status: 503, json: { error: { message: "backend error" } } },
    ]);
    vi.useFakeTimers();
    try {
      const result = mapsClient({ apiKey: KEY }).searchNearby({ center: { lat: 1, lng: 2 }, radiusM: 10, includedTypes: [] });
      const settled = result.catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const err = await settled;
      expect(err).toMatchObject({ name: "UpstreamError", service: "maps", status: 503, retryable: true });
      expect(String((err as Error).message)).not.toContain(KEY);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a daily quota 429 (it won't clear within the retries)", async () => {
    const daily = {
      status: 429,
      json: {
        error: {
          code: 429, status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded for quota metric 'SearchNearby requests' and limit 'SearchNearby requests per day' of service 'places.googleapis.com'.",
          details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit: "SearchNearbyRequestsPerDayPerProject" } }],
        },
      },
    };
    const sent = stubFetch([daily, daily, daily, daily]);
    await expect(mapsClient({ apiKey: KEY }).searchNearby({ center: { lat: 1, lng: 2 }, radiusM: 10, includedTypes: [] }))
      .rejects.toMatchObject({ name: "UpstreamError", service: "maps", status: 429, retryable: false, message: expect.stringContaining("per day") });
    expect(sent).toHaveLength(1);
  });

  it("still retries a per-minute 429", async () => {
    const minute = { status: 429, json: { error: { message: "Quota exceeded for quota metric 'SearchNearby requests' and limit 'SearchNearby requests per minute'." } } };
    const sent = stubFetch([minute, { json: { places: [rawPlace] } }]);
    vi.useFakeTimers();
    try {
      const result = mapsClient({ apiKey: KEY }).searchNearby({ center: { lat: 1, lng: 2 }, radiusM: 10, includedTypes: [] });
      await vi.runAllTimersAsync();
      expect(await result).toHaveLength(1);
      expect(sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a 400 and reports a non-JSON 200 as an UpstreamError", async () => {
    const sent = stubFetch([{ status: 400, json: { error: { message: "Invalid includedTypes" } } }]);
    await expect(mapsClient({ apiKey: KEY }).searchNearby({ center: { lat: 1, lng: 2 }, radiusM: 10, includedTypes: ["x"] }))
      .rejects.toMatchObject({ status: 400, retryable: false, message: expect.stringContaining("Invalid includedTypes") });
    expect(sent).toHaveLength(1);

    stubFetch([{ text: "<html>oops</html>" }]);
    await expect(mapsClient({ apiKey: KEY }).computeRoute({ origin: { placeId: "A" }, destination: { placeId: "B" } }))
      .rejects.toMatchObject({ name: "UpstreamError", service: "maps", retryable: false });
  });
});
