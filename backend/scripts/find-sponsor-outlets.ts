// One-off helper: finds Corner House Ice Cream outlets along the real Bengaluru -> Mysuru route (Places Text Search
// along the polyline, plus one search biased to Mysuru) and projects each onto the route, so the outlet(s) hardcoded
// in src/sponsors/cornerHouse.ts can be chosen with evidence. Prints; writes nothing.
// Run: npx tsx scripts/find-sponsor-outlets.ts [query]
import { mapsClient, type GPlace } from "../src/clients/maps";
import { env } from "../src/config/env";
import { decodePolyline, indexRoute, projectOntoRoute } from "../src/geo";

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const MYSORE_PALACE = { lat: 12.3052, lng: 76.6552 };

async function main() {
  const query = process.argv[2] ?? "Corner House Ice Cream";
  const maps = mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY });
  const route = await maps.computeRoute({ origin: BENGALURU, destination: MYSORE_PALACE });
  if (!route) throw new Error("no route");
  const index = indexRoute(decodePolyline(route.polyline));
  console.log(`route ${(route.distanceM / 1000).toFixed(1)} km`);

  const found = new Map<string, GPlace>();
  const along = await maps.searchText({ query, alongPolyline: route.polyline, pageSize: 20 });
  for (const p of along.places) found.set(p.id, p);
  const near = await maps.searchText({ query, bias: { center: { lat: 12.3, lng: 76.65 }, radiusM: 15_000 }, pageSize: 20 });
  for (const p of near.places) found.set(p.id, p);

  const rows = [...found.values()].map((p) => ({ p, proj: projectOntoRoute(index, p.location) }));
  rows.sort((a, b) => a.proj.distanceFromRouteM - b.proj.distanceFromRouteM);
  for (const { p, proj } of rows) {
    console.log(
      `${p.name} | ${p.id} | ${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)} | ` +
        `${(proj.routeDistanceM / 1000).toFixed(1)} km along | ${(proj.distanceFromRouteM / 1000).toFixed(2)} km off | ${proj.side}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
