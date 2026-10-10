// SPIKE (throwaway): turn raw discovery results into a draft "trip" — does a simple ranking give a good episode list?
// Reads out/maps/discovery.json (no API calls). Also writes out/maps/trip.geojson: drop it on https://geojson.io
// to eyeball the route and check the computed left/right sides.
// Run: npx tsx spikes/maps/select-probe.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePolyline, haversineM } from "./geo";

const OUT = path.resolve(__dirname, "../out/maps");

interface Candidate {
  source: string; id: string; name: string; location: { lat: number; lng: number };
  type?: string; ratings?: number; summary?: string; routeKm: number; offRouteKm: number; side: "left" | "right";
}

const STORY_TYPES = /historical|monument|museum|cultural|tourist_attraction|hindu_temple|national_park|wildlife|lake|landmark|palace|fort|garden|zoo|aquarium|art/;
const FOOD_TYPES = /restaurant|cafe|bakery|food/;

const MIN_GAP_KM = 4;          // no two items closer than this along the route (~3 min at highway speed)
const MAX_OFF_ROUTE_KM = 5;
const MIN_RATINGS = 300;       // drops tiny village shrines with a handful of reviews
const CITY_EDGE_KM = 15;       // inside the start/end cities, keep only the very top places
const MAX_ITEMS = 30;

async function main() {
  const d = JSON.parse(await readFile(path.join(OUT, "discovery.json"), "utf8"));
  const wiki: Candidate[] = d.wikiList;
  const totalKm = Math.max(...[...d.nearbyList, ...d.textList].map((c: Candidate) => c.routeKm));

  const google = new Map<string, Candidate>();
  for (const c of [...d.nearbyList, ...d.textList] as Candidate[]) google.set(c.id, c);

  const hasWiki = (c: Candidate) => {
    const words = c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4);
    return wiki.some((w) => haversineM(w.location, c.location) < 3_000 && words.some((x) => w.name.toLowerCase().includes(x)));
  };

  const scored = [...google.values()]
    .filter((c) => c.offRouteKm <= MAX_OFF_ROUTE_KM && (c.ratings ?? 0) >= MIN_RATINGS)
    .filter((c) => STORY_TYPES.test(c.type ?? "") || FOOD_TYPES.test(c.type ?? ""))
    .map((c) => {
      const wikiBonus = hasWiki(c) ? 1.5 : 0;
      const historyBonus = /historical|monument|landmark|fort|palace|museum/.test(c.type ?? "") ? 1 : 0;
      const detourPenalty = c.offRouteKm * 0.3;
      const inCity = c.routeKm < CITY_EDGE_KM || c.routeKm > totalKm - CITY_EDGE_KM;
      const score = Math.log10((c.ratings ?? 0) + 1) + wikiBonus + historyBonus - detourPenalty - (inCity ? 1.5 : 0);
      return { ...c, score: +score.toFixed(2), wiki: wikiBonus > 0, kind: FOOD_TYPES.test(c.type ?? "") ? "food" : "story" };
    })
    .sort((a, b) => b.score - a.score);

  // Greedy pick by score while enforcing spacing along the route.
  const picked: typeof scored = [];
  for (const c of scored) {
    if (picked.length >= MAX_ITEMS) break;
    if (picked.some((p) => Math.abs(p.routeKm - c.routeKm) < MIN_GAP_KM)) continue;
    picked.push(c);
  }
  picked.sort((a, b) => a.routeKm - b.routeKm);

  console.log(`Draft trip: ${picked.length} items over ${totalKm} km (from ${google.size} Google candidates)\n`);
  for (const c of picked) {
    console.log(
      `  km ${String(c.routeKm).padStart(5)}  ${c.side.padEnd(5)}  off ${String(c.offRouteKm).padStart(3)} km  ` +
        `${c.kind.padEnd(5)} ${c.wiki ? "W" : " "}  score ${c.score.toFixed(2).padStart(5)}  ${String(c.ratings).padStart(6)}  ${c.name}`,
    );
  }
  const gaps = picked.slice(1).map((c, i) => c.routeKm - picked[i].routeKm);
  console.log(`\n  largest gap without content: ${Math.max(...gaps).toFixed(1)} km  (W = has a Wikipedia article)`);

  // GeoJSON for visual verification of sides.
  const line = decodePolyline(d.route.polyline).map((p) => [p.lng, p.lat]);
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "route", stroke: "#444", "stroke-width": 3 }, geometry: { type: "LineString", coordinates: line } },
      ...picked.map((c) => ({
        type: "Feature",
        properties: { name: c.name, side: c.side, km: c.routeKm, "marker-color": c.side === "left" ? "#e8590c" : "#2f9e44" },
        geometry: { type: "Point", coordinates: [c.location.lng, c.location.lat] },
      })),
    ],
  };
  await writeFile(path.join(OUT, "trip.geojson"), JSON.stringify(geojson));
  console.log(`  wrote out/maps/trip.geojson (orange = computed left, green = computed right; route runs Bengaluru → Mysuru)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
