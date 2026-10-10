// SPIKE (throwaway): how do we find the places worth narrating along a route?
// Compares A) Places Text Search along route, B) Places Nearby Search at sampled points,
// C) Wikipedia geosearch. Then checks how many Google places have a Wikipedia article (= RAG facts).
// Run: npx tsx spikes/maps/discovery-probe.ts ["Origin" "Destination"]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeRoute, searchAlongRoute, searchNearby, stats, wikiGeosearch, type GPlace } from "./client";
import { decodePolyline, haversineM, indexRoute, projectOntoRoute, sampleRoute, type LatLng, type RouteIndex } from "./geo";

const OUT = path.resolve(__dirname, "../out/maps");
const MAX_OFF_ROUTE_M = 8_000;

// Well-known stops on Bengaluru -> Mysuru, used to measure recall of each strategy.
const MUST_FIND: Record<string, RegExp> = {
  "Srirangapatna fort": /srirangapatna|seringapatam|tipu sultan fort|tipu.*fort/i,
  "Ranganathaswamy temple": /ranganatha/i,
  "Daria Daulat Bagh": /daria daulat|dariya daulat|summer palace/i,
  "Gumbaz": /gumbaz|gumbaj/i,
  "Ranganathittu birds": /ranganathittu/i,
  "Nimishamba temple": /nimishamba/i,
  "Channapatna (toys)": /channapatna/i,
  "Ramanagara / Ramadevara Betta": /ramanagara|ramadevara/i,
  "Janapada Loka": /janapada/i,
  "Mysuru Palace": /mysore palace|mysuru palace|amba vilas/i,
  "Brindavan Gardens / KRS": /brindavan|krishna raja sagara|krs dam/i,
  "Maddur vada (food)": /maddur/i,
  "Kamat Lokaruchi (food)": /lokaruchi/i,
};

interface Candidate {
  source: "text" | "nearby" | "wiki";
  id: string;
  name: string;
  location: LatLng;
  type?: string;
  ratings?: number;
  summary?: string;
  routeKm: number;
  offRouteKm: number;
  side: "left" | "right";
}

function toCandidate(route: RouteIndex, source: Candidate["source"], id: string, name: string, location: LatLng, extra: Partial<Candidate> = {}): Candidate {
  const p = projectOntoRoute(route, location);
  return {
    source, id, name, location, ...extra,
    routeKm: +(p.routeDistanceM / 1000).toFixed(1),
    offRouteKm: +(p.distanceFromRouteM / 1000).toFixed(1),
    side: p.side,
  };
}

function fromGoogle(route: RouteIndex, source: "text" | "nearby", g: GPlace): Candidate {
  return toCandidate(route, source, g.id, g.displayName?.text ?? "?", { lat: g.location.latitude, lng: g.location.longitude }, {
    type: g.primaryType, ratings: g.userRatingCount, summary: g.editorialSummary?.text,
  });
}

function dedupe(list: Candidate[]) {
  return [...new Map(list.map((c) => [c.id, c])).values()].filter((c) => c.offRouteKm * 1000 <= MAX_OFF_ROUTE_M);
}

function recall(list: Candidate[]) {
  const found = Object.entries(MUST_FIND).filter(([, re]) => list.some((c) => re.test(c.name)));
  return { found: found.map(([k]) => k), missing: Object.keys(MUST_FIND).filter((k) => !found.some(([f]) => f === k)) };
}

function print(title: string, list: Candidate[], ms: number, top = 30) {
  const r = recall(list);
  console.log(`\n=== ${title}: ${list.length} places within ${MAX_OFF_ROUTE_M / 1000} km, ${ms} ms`);
  console.log(`recall ${r.found.length}/${Object.keys(MUST_FIND).length}; missing: ${r.missing.join(", ") || "none"}`);
  const sorted = [...list].sort((a, b) => (b.ratings ?? 0) - (a.ratings ?? 0)).slice(0, top).sort((a, b) => a.routeKm - b.routeKm);
  for (const c of sorted) {
    console.log(
      `  ${String(c.routeKm).padStart(6)} km  ${c.side.padEnd(5)}  off ${String(c.offRouteKm).padStart(4)} km  ` +
        `${String(c.ratings ?? "").padStart(6)}  ${(c.type ?? "").padEnd(20)} ${c.name}`,
    );
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, Math.round(performance.now() - t)];
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const [origin = "Bengaluru", destination = "Mysore Palace, Mysuru"] = process.argv.slice(2);

  const [r, routeMs] = await timed(() => computeRoute(origin, destination));
  const route = indexRoute(decodePolyline(r.polyline));
  console.log(
    `route ${origin} -> ${destination}: ${(r.distanceM / 1000).toFixed(1)} km, ${Math.round(r.durationS / 60)} min, ` +
      `${route.points.length} polyline points (${r.polyline.length} chars), ${routeMs} ms`,
  );

  // A) Text Search along route.
  const QUERIES = ["historical places", "tourist attractions", "famous temples", "famous local restaurants"];
  const [textRaw, textMs] = await timed(async () => (await Promise.all(QUERIES.map((q) => searchAlongRoute(q, r.polyline)))).flat());
  const textList = dedupe(textRaw.map((g) => fromGoogle(route, "text", g)));
  print(`A) Text Search along route (${QUERIES.length} queries, ${stats.textSearch} calls)`, textList, textMs);

  // B) Nearby Search at sampled points.
  const TYPES = [
    "historical_place", "historical_landmark", "monument", "museum", "cultural_landmark",
    "tourist_attraction", "hindu_temple", "national_park", "wildlife_park", "lake",
  ];
  const samples = sampleRoute(route, 15_000);
  const [nearbyRaw, nearbyMs] = await timed(async () => (await Promise.all(samples.map((s) => searchNearby(s, 8_000, TYPES)))).flat());
  const nearbyList = dedupe(nearbyRaw.map((g) => fromGoogle(route, "nearby", g)));
  print(`B) Nearby Search every 15 km, r=8 km (${stats.nearby} calls)`, nearbyList, nearbyMs);

  // C) Wikipedia geosearch.
  const wikiSamples = sampleRoute(route, 10_000);
  // Sequential: Wikipedia rate-limits parallel bursts ("You are making too many requests").
  const [wikiRaw, wikiMs] = await timed(async () => {
    const hits = [];
    for (const s of wikiSamples) hits.push(...(await wikiGeosearch(s)));
    return hits;
  });
  const wikiList = dedupe(wikiRaw.map((w) => toCandidate(route, "wiki", `wiki:${w.pageid}`, w.title, { lat: w.lat, lng: w.lon })));
  print(`C) Wikipedia geosearch every 10 km, r=10 km (${stats.wiki} calls) — no popularity signal, first 30 by route order`, wikiList, wikiMs);

  // Union of Google results, and how many of the most popular have a Wikipedia article nearby (RAG coverage).
  const google = dedupe([...textList, ...nearbyList]);
  const unionRecall = recall([...google, ...wikiList]);
  console.log(`\n=== A ∪ B ∪ C recall ${unionRecall.found.length}/${Object.keys(MUST_FIND).length}; missing: ${unionRecall.missing.join(", ") || "none"}`);

  const topGoogle = [...google].sort((a, b) => (b.ratings ?? 0) - (a.ratings ?? 0)).slice(0, 25);
  console.log(`\n=== Wikipedia coverage for top 25 Google places (article within 1.5 km whose title shares a word):`);
  let matched = 0;
  for (const g of topGoogle) {
    const words = g.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    const hit = wikiList
      .map((w) => ({ w, d: haversineM(w.location, g.location) }))
      .filter(({ w, d }) => d < 1_500 && words.some((word) => w.name.toLowerCase().includes(word)))
      .sort((a, b) => a.d - b.d)[0];
    if (hit) matched++;
    console.log(`  ${hit ? "✓" : "✗"} ${g.name.padEnd(45)} ${hit ? `→ ${hit.w.name} (${Math.round(hit.d)} m)` : ""}`);
  }
  console.log(`  ${matched}/${topGoogle.length} have a Wikipedia article`);

  console.log(`\nAPI calls: ${JSON.stringify(stats)}`);
  await writeFile(path.join(OUT, "discovery.json"), JSON.stringify({ route: r, textList, nearbyList, wikiList }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
