import { describe, expect, it } from "vitest";
import type { GPlace } from "../src/clients/maps";
import { UpstreamError } from "../src/clients/upstream";
import type { WikipediaClient } from "../src/clients/wikipedia";
import { decodePolyline, haversineM, indexRoute, type LatLng } from "../src/geo";
import { discover, foodSegments, offsetPoint } from "../src/pipeline/discover";
import { fakeMaps } from "./helpers/fakes";

// 100 km straight east on lat 12.
const route = indexRoute(Array.from({ length: 101 }, (_, i): LatLng => ({ lat: 12, lng: 77 + i * 0.00917 })));
const place = (id: string): GPlace => ({ id, name: id, location: { lat: 12, lng: 77 }, types: ["museum"], userRatingCount: 10 });
const fakeWiki = (): WikipediaClient & { calls: LatLng[] } => {
  const calls: LatLng[] = [];
  return {
    calls,
    geosearch: async ({ center }) => {
      calls.push(center);
      return [{ pageId: calls.length, title: `A${calls.length}`, location: center }, { pageId: 1000, title: "same", location: center }];
    },
    searchByName: async () => [],
    extract: async () => null,
  };
};

describe("discover", () => {
  it("samples Nearby every 15 km, Wikipedia every 10 km, and dedupes by id", async () => {
    const centers: LatLng[] = [];
    const wikipedia = fakeWiki();
    const d = await discover(
      { maps: fakeMaps({ searchNearby: async ({ center }) => (centers.push(center), [place("same"), place(`p${centers.length}`)]) }), wikipedia },
      route,
    );
    expect(centers.length).toBe(Math.ceil(route.totalM / 15_000) + 1); // every 15 km plus the end
    expect(wikipedia.calls.length).toBe(Math.ceil(route.totalM / 10_000) + 1);
    expect(d.google.filter((p) => p.id === "same")).toHaveLength(1);
    expect(d.wiki.filter((w) => w.pageId === 1000)).toHaveLength(1);
    expect(d.stats).toMatchObject({ nearby: centers.length, nearbySplits: 0, failedCalls: 0 });
  });

  it("splits a Nearby call that returns 20 results into four smaller overlapping circles", async () => {
    const calls: Array<{ center: LatLng; radiusM: number }> = [];
    const full = Array.from({ length: 20 }, (_, i) => place(`f${i}`));
    let first = true;
    const d = await discover(
      {
        maps: fakeMaps({
          searchNearby: async ({ center, radiusM }) => {
            calls.push({ center, radiusM });
            if (first) {
              first = false;
              return full;
            }
            return [];
          },
        }),
        wikipedia: fakeWiki(),
      },
      route,
    );
    expect(d.stats.nearbySplits).toBe(4);
    const splits = calls.filter((c) => c.radiusM === 6000);
    expect(splits).toHaveLength(4);
    const origin = calls.find((c) => c.radiusM === 8000)!.center;
    for (const s of splits) expect(haversineM(origin, s.center)).toBeCloseTo(4000, -1);
    // The four centres are on the diagonals (all different signs).
    expect(new Set(splits.map((s) => `${Math.sign(s.center.lat - origin.lat)}${Math.sign(s.center.lng - origin.lng)}`)).size).toBe(4);
  });

  it("runs food Text Search per 100 km segment with that segment's polyline, following one extra page", async () => {
    expect(foodSegments(138_000)).toHaveLength(1);
    expect(foodSegments(250_000)).toHaveLength(2);
    expect(foodSegments(979_000)).toHaveLength(10);
    const polylines: string[] = [];
    const d = await discover(
      {
        maps: fakeMaps({
          searchText: async ({ alongPolyline, pageToken }) => {
            polylines.push(alongPolyline ?? "");
            return pageToken ? { places: [place(`t2-${polylines.length}`)] } : { places: [place(`t1-${polylines.length}`)], nextPageToken: "next" };
          },
        }),
        wikipedia: fakeWiki(),
      },
      route,
    );
    expect(polylines).toHaveLength(2); // one segment (100 km), two pages
    const seg = decodePolyline(polylines[0]);
    expect(seg[0].lng).toBeCloseTo(77, 3);
    expect(d.stats.textSearch).toBe(2);
  });

  it("skips failed calls with a warning and carries on", async () => {
    const warnings: string[] = [];
    let n = 0;
    const d = await discover(
      {
        maps: fakeMaps({ searchNearby: async () => { if (n++ === 0) throw new UpstreamError("maps", 429, "quota", true); return [place(`p${n}`)]; } }),
        wikipedia: fakeWiki(),
        warn: (m) => warnings.push(m),
      },
      route,
    );
    expect(d.stats.failedCalls).toBe(1);
    expect(warnings[0]).toMatch(/nearby failed/);
    expect(d.google.length).toBeGreaterThan(0);
  });

  it("fails when every Google call failed", async () => {
    const boom = async () => {
      throw new UpstreamError("maps", 500, "down", true);
    };
    await expect(discover({ maps: fakeMaps({ searchNearby: boom, searchText: boom }), wikipedia: fakeWiki() }, route)).rejects.toThrow(/every discovery call failed/);
  });

  it("offsetPoint moves roughly the asked distance", () => {
    const p = { lat: 12, lng: 77 };
    expect(haversineM(p, offsetPoint(p, 3000, 4000))).toBeCloseTo(5000, -1);
  });
});
