import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePolyline, indexRoute } from "../src/geo";
import { prepare } from "../src/pipeline/candidates";
import { DiscoveryFileSchema, type DiscoveryFile } from "../src/pipeline/discoveryFile";
import { fallbackPicks, finalizeItems, introItem, limitFood } from "../src/pipeline/plan";
import { avgSpeedMps, selectPicks } from "../src/pipeline/select";
import { buildPool, buildSlots } from "../src/pipeline/slots";

// Trimmed discovery runs (ids, names, locations, types, rating counts, Wikipedia descriptions), made with
// `scripts/build-trip.ts --save-discovery`. No API is called here.
const load = (name: string): DiscoveryFile =>
  DiscoveryFileSchema.parse(JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")));

function run(file: DiscoveryFile) {
  const route = indexRoute(decodePolyline(file.route.polyline));
  const prepared = prepare({
    route, google: file.google, wiki: file.wiki, originLabel: file.origin.label, destinationLabel: file.destination.label,
  });
  const pool = buildPool(prepared);
  const slots = buildSlots(pool, route, file.route.durationS);
  const v = avgSpeedMps(file.route);
  const picks = limitFood(fallbackPicks(slots, ["history", "food"], route.totalM), v);
  const items = finalizeItems(picks, { intro: introItem("trip"), avgSpeedMps: v, totalM: route.totalM });
  return { route, prepared, pool, slots, items, v };
}

describe("Bengaluru -> Mysuru fixture", () => {
  const file = load("discovery-blr-mys.json");
  const { route, prepared, pool, slots, items } = run(file);

  it("has the expected shape: 138 km and 19 slots (10 for the first hour, then one per 10 minutes)", () => {
    expect(file.route.distanceM).toBeGreaterThan(130_000);
    expect(slots).toHaveLength(19);
  });

  it("keeps one Maddur Tiffany's", () => {
    const maddur = pool.strict.filter((c) => /maddur tiffany/i.test(c.name));
    expect(maddur).toHaveLength(1);
    expect(prepared.pois.filter((c) => /maddur tiffany/i.test(c.name)).length).toBeGreaterThan(1);
  });

  it("finds Channapatna, Mandya and Srirangapatna as towns, not their constituencies or districts", () => {
    const towns = pool.towns.map((t) => t.name);
    expect(towns).toEqual(expect.arrayContaining(["Channapatna", "Mandya", "Srirangapatna"]));
    expect(towns.some((t) => /constituency|district|university/i.test(t))).toBe(false);
  });

  it("matches the destination palace to its own article, not a bus station", () => {
    const palace = prepared.pois.find((c) => /mysuru palace/i.test(c.name) || /mysore palace$/i.test(c.name));
    expect(palace?.article?.title).toBe("Mysore Palace");
  });

  it("keeps only prominent places inside the city edges", () => {
    for (const c of pool.strict.filter((x) => x.inEdge && x.kind !== "episode")) {
      expect(c.ratings >= 5000 || (Boolean(c.article) && c.ratings >= 1000), c.name).toBe(true);
    }
  });

  it("fills the Mandya -> Srirangapatna stretch and leaves no long gaps", () => {
    const between = items.filter((i) => i.anchorRouteDistanceM > 94_000 && i.anchorRouteDistanceM < 125_000);
    expect(between.length).toBeGreaterThanOrEqual(2);
    const gaps = items.slice(1).map((i, k) => i.anchorRouteDistanceM - items[k].anchorRouteDistanceM);
    expect(Math.max(...gaps)).toBeLessThan(35_000);
    expect(route.totalM).toBeGreaterThan(130_000);
  });

  it("produces items in route order with the intro first and spacing respected", () => {
    expect(items[0].type).toBe("trip-intro");
    for (let k = 1; k < items.length; k++) {
      expect(items[k].anchorRouteDistanceM).toBeGreaterThanOrEqual(items[k - 1].anchorRouteDistanceM);
    }
  });
});

describe("Bengaluru -> Mumbai fixture", () => {
  const file = load("discovery-blr-mum.json");
  const { prepared, pool, slots, items } = run(file);

  it("cuts a 980 km route into 60 slots", () => {
    expect(slots).toHaveLength(60);
  });

  it("matches Marine Drive to 'Marine Drive, Mumbai'", () => {
    const marine = prepared.pois.filter((c) => c.name === "Marine Drive, Mumbai" || /^marine drive$/i.test(c.name));
    expect(marine.length).toBeGreaterThan(0);
    expect(marine.some((c) => c.article?.title === "Marine Drive, Mumbai")).toBe(true);
  });

  it("does not match Lalbagh to its metro station, nor Ambabai Temple to Kolhapur district", () => {
    const lalbagh = prepared.pois.find((c) => c.ratings === 178970); // Lalbagh Botanical Garden
    expect(lalbagh).toBeDefined();
    expect(lalbagh?.article?.title ?? "").not.toMatch(/metro station/i);
    const ambabai = prepared.pois.find((c) => c.googlePlaceId && c.ratings === 97270); // Shri Ambabai Temple, Kolhapur
    expect(ambabai).toBeDefined();
    expect(ambabai?.article?.title ?? "").not.toMatch(/district/i);
  });

  it("never matches a POI to a town, region or junk article", () => {
    for (const c of prepared.pois) {
      expect(c.article?.description ?? "").not.toMatch(/metro station|constituency|district of|^city in|^town in/i);
    }
  });

  it("leaves no two neighbouring slots empty", () => {
    const empty = slots.map((s) => s.candidates.length === 0 && s.towns.length === 0);
    for (let i = 1; i < empty.length; i++) expect(empty[i] && empty[i - 1], `slots ${i - 1} and ${i}`).toBe(false);
  });

  it("builds a trip of about one item per slot with the intro first", () => {
    expect(items.length).toBeGreaterThan(40);
    expect(items.length).toBeLessThanOrEqual(slots.length + slots.length / 2);
    expect(items[0].type).toBe("trip-intro");
    expect(pool.towns.length).toBeGreaterThan(20);
  });

  it("has at most one food item per 45 minutes", () => {
    const food = items.filter((i) => i.type === "food");
    for (let k = 1; k < food.length; k++) {
      expect(food[k].anchorRouteDistanceM - food[k - 1].anchorRouteDistanceM).toBeGreaterThanOrEqual(45 * 60 * avgSpeedMps(file.route) - 1);
    }
  });
});

describe("Bengaluru city fixture (Nammoora Thindi -> Orion Mall, 27 min)", () => {
  const file = load("discovery-blr-city.json");
  const route = indexRoute(decodePolyline(file.route.polyline));
  const prepared = prepare({ route, google: file.google, wiki: file.wiki, originLabel: file.origin.label, destinationLabel: file.destination.label });

  it("gets five slots for a half-hour trip, each with something to tell", () => {
    const slots = buildSlots(buildPool(prepared), route, file.route.durationS);
    expect(slots).toHaveLength(5);
    for (const s of slots) expect(s.candidates.length + s.towns.length, `slot ${s.index}`).toBeGreaterThan(0);
  });

  it("keeps ISKCON, the most famous place on the route (143 823 ratings, 400 m away)", async () => {
    const selection = await selectPicks(undefined, { route, durationS: file.route.durationS, prepared, interests: ["history", "food"] });
    const items = finalizeItems(selection.picks, { intro: introItem("trip"), avgSpeedMps: avgSpeedMps(file.route), totalM: route.totalM });
    expect(items.map((i) => i.title)).toContain("ISKCON Temple, Bengaluru");
  });
});
