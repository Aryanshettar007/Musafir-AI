// Tunes place selection offline on a saved discovery file (no API calls): match -> filter -> group -> slots ->
// fallback pick -> spacing, on the same product code the trip builder uses. Writes a GeoJSON for geojson.io
// (orange = left of the road, green = right, grey = none/both sides, blue-less by design).
// Usage: npx tsx scripts/preview-selection.ts test/fixtures/discovery-blr-mys.json [--interests history,food] [--out out.geojson]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { INTEREST_IDS, type InterestId } from "../src/catalog/interests";
import { decodePolyline, indexRoute } from "../src/geo";
import { prepare } from "../src/pipeline/candidates";
import { DiscoveryFileSchema } from "../src/pipeline/discoveryFile";
import { fallbackPicks, finalizeItems, introItem, limitFood } from "../src/pipeline/plan";
import { avgSpeedMps } from "../src/pipeline/select";
import { buildPool, buildSlots } from "../src/pipeline/slots";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Usage: preview-selection.ts <discovery.json> [--interests a,b] [--out file.geojson]");
  const d = DiscoveryFileSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const interests = (arg("interests")?.split(",") ?? ["history", "food"]) as InterestId[];
  if (!interests.every((i) => INTEREST_IDS.includes(i))) throw new Error("Unknown interest");

  const route = indexRoute(decodePolyline(d.route.polyline));
  const v = avgSpeedMps(d.route);
  const prepared = prepare({ route, google: d.google, wiki: d.wiki, originLabel: d.origin.label, destinationLabel: d.destination.label });
  const pool = buildPool(prepared);
  const slots = buildSlots(pool, route, d.route.durationS);
  const picks = limitFood(fallbackPicks(slots, interests, route.totalM), v);
  const items = finalizeItems(picks, { intro: introItem(`${d.origin.label} to ${d.destination.label}`), avgSpeedMps: v, totalM: route.totalM });

  console.log(`${d.origin.label} -> ${d.destination.label}: ${(d.route.distanceM / 1000).toFixed(1)} km, ${Math.round(d.route.durationS / 60)} min, ${slots.length} slots`);
  console.log(`discovery: ${d.google.length} Google places, ${d.wiki.length} Wikipedia articles; classes ${JSON.stringify(prepared.counts)}`);
  const matched = prepared.pois.filter((p) => p.article).length;
  console.log(`POIs ${prepared.pois.length} (${matched} matched to articles) -> strict ${pool.strict.length} (episodes ${pool.strict.filter((c) => c.kind === "episode").length}), relaxed extra ${pool.relaxed.length}, towns ${pool.towns.length}, regions ${pool.regions.length}`);
  const empty = slots.filter((s) => s.candidates.length === 0 && s.towns.length === 0).map((s) => s.index);
  console.log(`empty slots: ${empty.length ? empty.join(", ") : "none"}; relaxed slots: ${slots.filter((s) => s.relaxed).map((s) => s.index).join(", ") || "none"}\n`);
  console.log(`${items.length} items (fallback pick, no curator):`);
  for (const i of items) {
    const c = i.candidate;
    console.log(
      `  km ${(i.anchorRouteDistanceM / 1000).toFixed(1).padStart(6)}  ${i.type.padEnd(12)} ${i.side.padEnd(5)} ${i.focus.padEnd(12)} ${String(c?.ratings ?? "").padStart(6)} ${c?.article ? "W" : " "} ${i.title}${c?.members ? ` (+${c.members.length} places)` : ""}`,
    );
  }
  const gaps = items.slice(1).map((it, k) => (it.anchorRouteDistanceM - items[k].anchorRouteDistanceM) / 1000);
  if (gaps.length) console.log(`\nlargest gap between items: ${Math.max(...gaps).toFixed(1)} km`);

  const out = arg("out") ?? path.join("generated", "preview-selection.geojson");
  const colour = (s: string) => (s === "left" ? "#e8590c" : s === "right" ? "#2f9e44" : "#868e96");
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "route", stroke: "#444", "stroke-width": 3 }, geometry: { type: "LineString", coordinates: route.points.map((p) => [p.lng, p.lat]) } },
      ...items.flatMap((i) =>
        i.candidate
          ? [{ type: "Feature", properties: { name: i.title, type: i.type, side: i.side, km: +(i.anchorRouteDistanceM / 1000).toFixed(1), "marker-color": colour(i.side) }, geometry: { type: "Point", coordinates: [i.candidate.location.lng, i.candidate.location.lat] } }]
          : [],
      ),
    ],
  };
  await writeFile(out, JSON.stringify(geojson));
  console.log(`wrote ${out} (orange = left, green = right, grey = none; the route runs ${d.origin.label} -> ${d.destination.label})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
