import { describe, expect, it } from "vitest";
import { brand, clusterEpisodes, dedupeArticles, dedupeChains, passesFilter, poiScore, prepare } from "../src/pipeline/candidates";
import { cacheKey } from "../src/pipeline/cacheKey";
import { classifyWiki, interestsFor, poiKind } from "../src/pipeline/classify";
import { matchArticle, nameTokens } from "../src/pipeline/match";
import { alternativesFor, enforceSpacing, fallbackPicks, finalizeItems, fitsSpacing, introItem, limitFood, plan, sponsoredItem } from "../src/pipeline/plan";
import { checkCuratorAnswer, idMap } from "../src/pipeline/curate";
import { buildSlots, slotCount, slotIndex, type Pool } from "../src/pipeline/slots";
import { triggerFor } from "../src/pipeline/triggers";
import { TARGET_SECONDS } from "../src/pipeline/rules";
import type { Article, Candidate, PlannedItem } from "../src/pipeline/types";
import { indexRoute, type LatLng } from "../src/geo";

// A straight 100 km route going east along lat 12: distance along the route == (lng - 77) * 108.9 km (about).
const line: LatLng[] = Array.from({ length: 101 }, (_, i) => ({ lat: 12, lng: 77 + i * 0.00917 }));
const route = indexRoute(line);
const at = (km: number, offsetM = 0): LatLng => ({ lat: 12 + offsetM / 111_000, lng: 77 + (km * 1000) / (111_320 * Math.cos((12 * Math.PI) / 180)) });

let n = 0;
function cand(over: Partial<Candidate> & { km: number }): Candidate {
  const { km, ...rest } = over;
  const c: Candidate = {
    key: `k${++n}`, kind: "poi", name: `Place ${n}`, location: at(km), types: ["tourist_attraction"], ratings: 1000, interests: [],
    distanceFromRouteM: 0, routeDistanceM: km * 1000, side: "left", historic: false, inEdge: false, score: 3, heard: false, ...rest,
  };
  return c;
}

describe("classifyWiki", () => {
  it.each([
    ["Town in Mandya district, Karnataka", "town"],
    ["Census town in Ramanagara district", "town"],
    ["City in Karnataka, India", "town"],
    ["Village in Kolhapur district", "town"],
    ["District of Maharashtra, India", "region"],
    ["River in South India", "region"],
    ["Hill range in Karnataka", "region"],
    ["Metro station in Bengaluru", "junk"],
    ["Bus station in Mysuru", "junk"],
    ["Hill station in Karnataka", "region"],
    ["Railway station in Karnataka", "junk"],
    ["Lok Sabha constituency in Karnataka", "junk"],
    ["Engineering college in Pune", "junk"],
    ["Taluk in Mandya district", "junk"],
    ["Town and taluk in Mandya district", "town"],
    ["Hindu temple in Kolhapur district", "landmark"],
    ["Botanical garden in Bengaluru", "landmark"],
    [undefined, "landmark"],
  ] as const)("%s -> %s", (description, expected) => {
    expect(classifyWiki(description)).toBe(expected);
  });
});

describe("poiKind and interests", () => {
  it("separates food from sights using the primary type first", () => {
    expect(poiKind("restaurant", ["restaurant", "food"])).toBe("food");
    expect(poiKind("tourist_attraction", ["tourist_attraction", "restaurant"])).toBe("poi");
    expect(poiKind("parking", ["parking"])).toBeUndefined();
    expect(poiKind(undefined, ["hindu_temple"])).toBe("poi");
  });
  it("derives interests from types and name words", () => {
    expect(interestsFor(["hindu_temple"], "Ambabai Temple")).toEqual(expect.arrayContaining(["spirituality", "architecture"]));
    expect(interestsFor(["restaurant"], "Maddur Tiffany's")).toEqual(["food"]);
    expect(interestsFor(["national_park"], "Bannerghatta")).toContain("nature");
  });
});

describe("name matching (trip spec 5.3.1)", () => {
  const article = (title: string, description: string, location: LatLng): Article => ({ pageId: n++, title, description, location });
  const exclude = new Set(["mumbai", "bengaluru"]);

  it("matches Marine Drive to its article although the two pins are 1.5 km apart", () => {
    const poi = { lat: 18.9432, lng: 72.8235 };
    const a = article("Marine Drive, Mumbai", "Boulevard in Mumbai", { lat: 18.9432 + 0.0138, lng: 72.8235 });
    expect(matchArticle("Marine Drive", poi, [a], { exclude })).toBe(a);
  });

  it("does not match Lalbagh to its metro station or Ambabai Temple to Kolhapur district", () => {
    const lalbagh = { lat: 12.9507, lng: 77.5848 };
    const metro = article("Lalbagh metro station", "Metro station in Bengaluru", { lat: 12.9498, lng: 77.5855 });
    expect(matchArticle("Lalbagh Botanical Garden", lalbagh, [metro], { exclude })).toBeUndefined();
    const garden = article("Lalbagh", "Botanical garden in Bengaluru", { lat: 12.9507, lng: 77.5848 });
    expect(matchArticle("Lalbagh Botanical Garden", lalbagh, [metro, garden], { exclude })).toBe(garden);

    const ambabai = { lat: 16.7048, lng: 74.2433 };
    const district = article("Kolhapur district", "District of Maharashtra, India", { lat: 16.7, lng: 74.24 });
    expect(matchArticle("Ambabai Temple", ambabai, [district], { exclude })).toBeUndefined();
  });

  it("needs half of the name's words, and only 1.5 km for a single shared word", () => {
    const p = { lat: 12, lng: 77 };
    expect(matchArticle("Daria Daulat Bagh", p, [article("Daria Daulat Bagh", "Palace", at(0))], {})?.title).toBe("Daria Daulat Bagh");
    expect(matchArticle("Daria Daulat Bagh", p, [article("Bagh Garden", "Garden", p)], {})).toBeUndefined(); // 1 of 3 words
    const far = { lat: 12.02, lng: 77 }; // 2.2 km
    expect(matchArticle("Tipu Fort", p, [article("Tipu Sultan", "Sultan of Mysore", far)], {})).toBeUndefined();
    expect(matchArticle("Tipu Sultan Memorial", p, [article("Tipu Sultan Memorial", "Memorial", far)], {})?.title).toBe("Tipu Sultan Memorial");
  });

  it("drops accents, generic words and the trip's own place names from tokens", () => {
    expect(nameTokens("Śrī Ranganāthaswamy Temple, Mumbai", new Set(["mumbai"]))).toEqual(["ranganathaswamy"]);
  });

  it("matches the destination even when its name is all trip words, and across old and new spellings", () => {
    const palace = article("Mysore Palace", "Historical palace in Mysore, Karnataka, India", { lat: 12.3052, lng: 76.6552 });
    const bus = article("Mysuru Sub Urban Bus Station", "Bus station in Mysuru", { lat: 12.3055, lng: 76.6556 });
    const exclude = new Set(["mysore"]); // destination label "Mysore Palace"
    expect(matchArticle("Mysuru Palace", { lat: 12.3052, lng: 76.6552 }, [bus, palace], { exclude })).toBe(palace);
  });

  it("prefers the higher overlap, then the nearer article", () => {
    const p = { lat: 12, lng: 77 };
    const a = article("Gol Gumbaz", "Mausoleum", { lat: 12.005, lng: 77 });
    const b = article("Gumbaz", "Mausoleum", { lat: 12.001, lng: 77 });
    expect(matchArticle("Gol Gumbaz", p, [b, a], {})).toBe(a);
  });
});

describe("chains, duplicate articles and clusters", () => {
  it("keeps the most-reviewed branch of a food brand", () => {
    expect(brand("MTR - Best in Chitradurga")).toBe("mtr");
    expect(brand("Maddur Tiffanys @ Nidagatta")).toBe(brand("Maddur Tiffanys @ shivapura"));
    const a = cand({ kind: "food", name: "Maddur Tiffany's", ratings: 9000, km: 10 });
    const b = cand({ kind: "food", name: "Maddur Tiffanys Restaurant", ratings: 2000, km: 12 });
    const c = cand({ kind: "food", name: "Kamat Lokaruchi", ratings: 100, km: 30 });
    expect(dedupeChains([a, b, c])).toEqual([a, c]);
  });

  it("keeps one pin per article", () => {
    const art: Article = { pageId: 5, title: "Marine Drive", location: at(1) };
    const a = cand({ km: 1, article: art, score: 4 });
    const b = cand({ km: 2, article: art, score: 6 });
    expect(dedupeArticles([a, b])).toEqual([b]);
  });

  it("groups 3 or more POIs within 3 km into an episode led by the best member", () => {
    const fort = cand({ km: 20, name: "Fort", score: 5 });
    const temple = cand({ km: 20.5, name: "Temple", score: 4 });
    const tomb = cand({ km: 21.5, name: "Tomb", score: 6, side: "right" });
    const lone = cand({ km: 40, name: "Lone" });
    const pair1 = cand({ km: 60, name: "A" });
    const pair2 = cand({ km: 60.5, name: "B" });
    const { episodes, singles } = clusterEpisodes([lone, tomb, fort, pair1, temple, pair2]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].anchor?.name).toBe("Tomb");
    expect(episodes[0].members?.map((m) => m.name)).toEqual(["Fort", "Temple", "Tomb"]);
    expect(episodes[0].score).toBe(7);
    expect(episodes[0].kind).toBe("episode");
    expect(singles.map((s) => s.name).sort()).toEqual(["A", "B", "Lone"]);
  });
});

describe("filters (trip spec 5.3.2)", () => {
  it("applies distance, ratings, article and city-edge rules", () => {
    expect(passesFilter(cand({ km: 50, ratings: 400 }))).toBe(true);
    expect(passesFilter(cand({ km: 50, ratings: 100 }))).toBe(false);
    expect(passesFilter(cand({ km: 50, ratings: 100, article: { pageId: 1, title: "X", location: at(50) } }))).toBe(true);
    expect(passesFilter(cand({ km: 50, ratings: 5000, distanceFromRouteM: 5500 }))).toBe(false);
    expect(passesFilter(cand({ km: 50, ratings: 60, distanceFromRouteM: 7000 }), "relaxed")).toBe(true);
    expect(passesFilter(cand({ km: 50, ratings: 40 }), "relaxed")).toBe(false);
    // Inside the first and last 15 km only prominent places.
    expect(passesFilter(cand({ km: 5, ratings: 2000, inEdge: true }))).toBe(false);
    expect(passesFilter(cand({ km: 5, ratings: 6000, inEdge: true }))).toBe(true);
    expect(passesFilter(cand({ km: 5, ratings: 1200, inEdge: true, article: { pageId: 2, title: "Y", location: at(5) } }))).toBe(true);
  });

  it("scores with ratings, article, history, detour and city edge", () => {
    const base = { ratings: 999, article: undefined, historic: false, distanceFromRouteM: 0, inEdge: false };
    expect(poiScore(base)).toBeCloseTo(3, 5);
    expect(poiScore({ ...base, article: { pageId: 1, title: "x", location: at(1) }, historic: true })).toBeCloseTo(5.5, 5);
    expect(poiScore({ ...base, distanceFromRouteM: 2000, inEdge: true })).toBeCloseTo(3 - 0.6 - 1.5, 5);
  });
});

describe("prepare", () => {
  it("projects, classifies and matches discovery results", () => {
    const prepared = prepare({
      route,
      originLabel: "Start",
      destinationLabel: "End",
      google: [
        { id: "g1", name: "Shiva Temple", location: at(30, 800), primaryType: "hindu_temple", types: ["hindu_temple"], userRatingCount: 900 },
        { id: "g2", name: "Hotel Food", location: at(40, 100), primaryType: "restaurant", types: ["restaurant"], userRatingCount: 900 },
        { id: "g3", name: "Car Park", location: at(40), primaryType: "parking", types: ["parking"], userRatingCount: 900 },
      ],
      wiki: [
        { pageId: 1, title: "Shiva Temple, Somewhere", location: at(30, 900), description: "Hindu temple in India" },
        { pageId: 2, title: "Somewhere", location: at(32, 500), description: "Town in Somewhere district", length: 20000 },
        { pageId: 3, title: "Somewhere metro station", location: at(32), description: "Metro station" },
        { pageId: 4, title: "Faraway", location: at(32, 20_000), description: "Town in Faraway district" },
      ],
    });
    expect(prepared.pois.map((p) => p.key)).toEqual(["g1", "g2"]);
    expect(prepared.pois[0].article?.pageId).toBe(1);
    expect(prepared.pois[0].side).toBe("left");
    expect(prepared.pois[0].distanceFromRouteM).toBeGreaterThan(700);
    expect(prepared.towns.map((t) => t.name)).toEqual(["Somewhere"]); // Faraway is 20 km off the route
    expect(prepared.counts).toEqual({ landmark: 1, town: 2, region: 0, junk: 1 });
  });
});

describe("slots", () => {
  it("count is duration / 10 min clamped to 3..60", () => {
    expect(slotCount(9060)).toBe(15);
    expect(slotCount(60 * 60)).toBe(6);
    expect(slotCount(600)).toBe(3);
    expect(slotCount(60468)).toBe(60);
    expect(slotCount(10 * 3600 * 24)).toBe(60);
  });

  it("slotIndex clamps to the route", () => {
    expect(slotIndex(0, 100_000, 10)).toBe(0);
    expect(slotIndex(99_999, 100_000, 10)).toBe(9);
    expect(slotIndex(100_001, 100_000, 10)).toBe(9);
  });

  const pool = (over: Partial<Pool>): Pool => ({ strict: [], relaxed: [], towns: [], regions: [], ...over });
  const durationS = 6000; // 10 slots over 100 km

  it("shortlists the top three per slot, best first, plus the towns", () => {
    const list = [cand({ km: 1, score: 3 }), cand({ km: 2, score: 5 }), cand({ km: 3, score: 4 }), cand({ km: 4, score: 6 }), cand({ km: 15, score: 1 })];
    const town = cand({ km: 5, kind: "town", score: 4 });
    const slots = buildSlots(pool({ strict: list, towns: [town] }), route, durationS);
    expect(slots).toHaveLength(10);
    expect(slots[0].candidates.map((c) => c.score)).toEqual([6, 5, 4]);
    expect(slots[0].towns).toEqual([town]);
    expect(slots[1].candidates).toHaveLength(1);
  });

  it("fills an empty slot from the relaxed filters, then a region, and leaves it empty otherwise", () => {
    const relaxed = cand({ km: 25, ratings: 60 });
    const region = cand({ km: 35, kind: "region" });
    const slots = buildSlots(pool({ strict: [cand({ km: 5 })], relaxed: [relaxed], regions: [region] }), route, durationS);
    expect(slots[2].candidates).toEqual([relaxed]);
    expect(slots[2].relaxed).toBe(true);
    expect(slots[3].candidates).toEqual([region]);
    expect(slots[4].candidates).toEqual([]);
  });

  it("prefers a town over a region for an empty slot", () => {
    const town = cand({ km: 35, kind: "town" });
    const region = cand({ km: 36, kind: "region" });
    const slots = buildSlots(pool({ towns: [town], regions: [region] }), route, durationS);
    expect(slots[3].candidates).toEqual([]);
    expect(slots[3].towns).toEqual([town]);
    expect(fallbackPicks(slots, [], route.totalM).find((p) => p.candidate === town)?.type).toBe("town-welcome");
  });
});

describe("plan: anchors, sides and targets", () => {
  const slot = { fromM: 30_000 };
  it("places each type's anchor as the spec says", () => {
    expect(plan("story", cand({ km: 33 }), "general", slot, route.totalM).anchorRouteDistanceM).toBe(33_000);
    const town = plan("town-welcome", cand({ km: 33, kind: "town" }), "general", slot, route.totalM);
    expect(town.anchorRouteDistanceM).toBe(32_000);
    expect(town.side).toBe("none");
    const long = plan("long-form", cand({ km: 33, kind: "region" }), "general", slot, route.totalM);
    expect(long.anchorRouteDistanceM).toBe(30_000);
    expect(long.targetSeconds).toBe(TARGET_SECONDS["long-form"]);
  });

  it("uses side none near the route ends and for episodes spread over both sides", () => {
    expect(plan("story", cand({ km: 0.5, side: "left" }), "general", slot, route.totalM).side).toBe("none");
    expect(plan("story", cand({ km: 99.5, side: "left" }), "general", slot, route.totalM).side).toBe("none");
    expect(plan("story", cand({ km: 50, side: "right" }), "general", slot, route.totalM).side).toBe("right");
    const both = cand({ km: 50, kind: "episode", members: [cand({ km: 49, side: "left" }), cand({ km: 50, side: "right" }), cand({ km: 51, side: "left" })] });
    expect(plan("episode", both, "general", slot, route.totalM).side).toBe("none");
    const same = cand({ km: 50, kind: "episode", side: "left", members: [cand({ km: 49, side: "left" }), cand({ km: 50, side: "left" }), cand({ km: 51, side: "left" })] });
    expect(plan("episode", same, "general", slot, route.totalM).side).toBe("left");
  });
});

describe("food limit", () => {
  const v = 20; // m/s
  const food = (km: number, score: number): PlannedItem => ({ ...plan("food", cand({ km, kind: "food" }), "food", { fromM: 0 }, route.totalM), score });
  it("allows one food item per 45 minutes of driving and keeps the better of two close ones", () => {
    const gap = 45 * 60 * v; // 54 km
    const out = limitFood([food(10, 3), food(10 + gap / 2000, 5), food(10 + gap / 2000 + gap / 1000 + 1, 4)], v);
    expect(out.map((i) => i.score)).toEqual([5, 4]);
  });
});

describe("spacing (trip spec 5.4.5)", () => {
  const v = 20;
  const item = (type: PlannedItem["type"], anchorM: number, score = 3, extra: Partial<PlannedItem> = {}): PlannedItem => ({
    type, focus: "general", side: "none", targetSeconds: TARGET_SECONDS[type as keyof typeof TARGET_SECONDS] ?? 60, anchorRouteDistanceM: anchorM, score,
    title: `${type}@${anchorM}`, candidate: cand({ km: anchorM / 1000 }), ...extra,
  });

  it("needs target + 60 seconds of driving between anchors", () => {
    const gap = (60 + 60) * v; // 2 400 m after a story
    expect(enforceSpacing([item("story", 10_000), item("story", 10_000 + gap)], v, 100_000)).toHaveLength(2);
    expect(enforceSpacing([item("story", 10_000, 5), item("story", 10_000 + gap - 1, 3)], v, 100_000).map((i) => i.score)).toEqual([5]);
  });

  it("shortens an episode to a story before dropping anything", () => {
    const members = [cand({ km: 19, side: "left" }), cand({ km: 20, side: "left" }), cand({ km: 21, side: "left" })];
    const episode = cand({ km: 20, kind: "episode", members, anchor: members[1] });
    const ep = plan("episode", episode, "general", { fromM: 0 }, 100_000);
    // An episode needs (150 + 60) s x 20 = 4 200 m; a story 3 000 m after it fits only once shortened to a story.
    const next = item("story", 20_000 + 3_000);
    const out = enforceSpacing([ep, next], v, 100_000);
    expect(out.map((i) => i.type)).toEqual(["story", "story"]);
    expect(out[0].candidate).toBe(members[1]);
  });

  it("never drops the intro or the sponsor, neighbours give way", () => {
    const intro = introItem("A to B");
    const sponsor = sponsoredItem({
      sponsorSlug: "ch", sponsorName: "Corner House", outletLabel: "x", anchorRouteDistanceM: 50_000, side: "left", title: "Ad",
      audio: { storageKey: "k", bytes: 1, durationS: 30 }, transcript: "t", triggerRadiusM: 400,
    });
    const picks = [item("story", 1_000, 9), item("story", 49_500, 9), item("story", 50_800, 9), item("story", 80_000, 1)];
    const out = finalizeItems(picks, { intro, sponsor, avgSpeedMps: v, totalM: 100_000 });
    expect(out.map((i) => i.type)).toEqual(["trip-intro", "sponsored", "story"]);
    expect(out[2].anchorRouteDistanceM).toBe(80_000);
    expect(out[1].anchorRouteDistanceM).toBe(50_000);
    // The first story sat 1 000 m after the intro: closer than (30 + 60) x 20 = 1 800 m, so it was dropped.
  });
});

describe("refilling an item dropped for lack of facts", () => {
  const v = 20;
  it("offers the same slot's other entries, then its towns, skipping places already in the trip", () => {
    const top = cand({ km: 15, name: "Top" });
    const second = cand({ km: 17, name: "Second" });
    const used = cand({ km: 18, name: "Used" });
    const other = cand({ km: 35, name: "Other slot" });
    const town = cand({ km: 16, kind: "town", name: "Town" });
    const slots = buildSlots({ strict: [top, second, used, other], relaxed: [], towns: [town], regions: [] }, route, 6000);
    const dropped = plan("story", top, "general", slots[1], route.totalM);
    const alts = alternativesFor(dropped, slots, new Set([top.key, used.key]), ["history"], route.totalM);
    expect(alts.map((a) => [a.type, a.title])).toEqual([["story", "Second"], ["town-welcome", "Town"]]);
  });

  it("fits an alternative only where spacing and the food limit allow", () => {
    const story = (km: number) => plan("story", cand({ km }), "general", { fromM: 0 }, 100_000);
    const food = (km: number) => plan("food", cand({ km, kind: "food" }), "food", { fromM: 0 }, 100_000);
    const placed = [story(10), story(20)];
    // A story needs (60 + 60) s x 20 m/s = 2 400 m after the previous anchor and before the next.
    expect(fitsSpacing(story(15), placed, v)).toBe(true);
    expect(fitsSpacing(story(12), placed, v)).toBe(false);
    expect(fitsSpacing(story(18), placed, v)).toBe(false);
    // Food: at most one per 45 minutes (54 km at 20 m/s).
    expect(fitsSpacing(food(15), placed, v)).toBe(true);
    expect(fitsSpacing(food(15), [...placed, food(60)], v)).toBe(false);
  });
});

describe("curator answer checks (D3)", () => {
  const interests = ["history", "food"] as const;
  const mk = () => {
    const s0 = cand({ km: 5, name: "Fort" });
    const f0 = cand({ km: 8, kind: "food", name: "Dosa" });
    const t0 = cand({ km: 9, kind: "town", name: "Town" });
    const e1 = cand({ km: 15, kind: "episode", name: "Cluster", members: [cand({ km: 15 }), cand({ km: 15.5 }), cand({ km: 16 })] });
    const slots = buildSlots({ strict: [s0, f0, e1], relaxed: [], towns: [t0], regions: [] }, route, 6000);
    return { slots, s0, f0, t0, e1 };
  };

  it("accepts valid picks, including a separate town-welcome in the same slot", () => {
    const { slots } = mk();
    const ids = idMap(slots);
    const sid = [...ids.entries()].find(([, e]) => e.candidate.name === "Fort")![0];
    const tid = [...ids.entries()].find(([, e]) => e.candidate.name === "Town")![0];
    const { items, problems } = checkCuratorAnswer(
      { picks: [{ slot: 0, candidateId: sid, type: "story", focus: "history" }, { slot: 0, candidateId: tid, type: "town-welcome", focus: "general" }] },
      slots, interests, route.totalM,
    );
    expect(problems).toEqual([]);
    expect(items.map((i) => i.type)).toEqual(["story", "town-welcome"]);
  });

  it("reports unknown ids, wrong slot, wrong type and foreign focus as problems", () => {
    const { slots } = mk();
    const ids = idMap(slots);
    const cluster = [...ids.entries()].find(([, e]) => e.candidate.name === "Cluster")!;
    const fort = [...ids.entries()].find(([, e]) => e.candidate.name === "Fort")![0];
    const { items, problems } = checkCuratorAnswer(
      {
        picks: [
          { slot: 0, candidateId: "s9c9", type: "story", focus: "general" },
          { slot: 3, candidateId: fort, type: "story", focus: "general" },
          { slot: cluster[1].slot.index, candidateId: cluster[0], type: "story", focus: "general" },
          { slot: 0, candidateId: fort, type: "story", focus: "nature" },
          { slot: 1, candidateId: null, type: "story", focus: "general" },
        ],
      },
      slots, interests, route.totalM,
    );
    expect(items).toEqual([]);
    expect(problems).toHaveLength(4);
    expect(problems.join(" ")).toMatch(/not in the shortlists/);
    expect(problems.join(" ")).toMatch(/belongs to slot/);
    expect(problems.join(" ")).toMatch(/cannot be type "story"/);
    expect(problems.join(" ")).toMatch(/not one of the listener's interests/);
  });

  it("drops repeats silently", () => {
    const { slots } = mk();
    const fort = [...idMap(slots).entries()].find(([, e]) => e.candidate.name === "Fort")![0];
    const food = [...idMap(slots).entries()].find(([, e]) => e.candidate.name === "Dosa")![0];
    const { items, problems } = checkCuratorAnswer(
      { picks: [{ slot: 0, candidateId: fort, type: "story", focus: "general" }, { slot: 0, candidateId: food, type: "food", focus: "food" }, { slot: 0, candidateId: fort, type: "story", focus: "general" }] },
      slots, interests, route.totalM,
    );
    expect(problems).toEqual([]);
    expect(items).toHaveLength(1); // one non-town pick per slot
  });
});

describe("cache key and triggers", () => {
  const base = { type: "story", placeIds: ["b", "a"], language: "kn-IN", voice: "Girish", focus: "history", side: "left" } as const;
  it("sorts place ids and includes everything that changes the audio", () => {
    expect(cacheKey(base)).toBe("v5|story|a,b|kn-IN|Girish|history|left");
    expect(cacheKey({ ...base, voice: "Nalini" })).not.toBe(cacheKey(base));
    expect(cacheKey({ ...base, side: "right" })).not.toBe(cacheKey(base));
    expect(cacheKey({ ...base, focus: "general" })).not.toBe(cacheKey(base));
  });
  it("keys the trip intro per trip", () => {
    expect(cacheKey({ ...base, type: "trip-intro", placeIds: [], tripId: "T1", focus: "general", side: "none" })).toBe("v5|trip-intro|T1|kn-IN|Girish");
  });

  it("starts 30 % of the audio before the anchor, never before the route start", () => {
    const t = triggerFor(route, { anchorRouteDistanceM: 50_000, durationS: 60, avgSpeedMps: 20 });
    expect(t.routeDistanceM).toBeCloseTo(50_000 - 20 * 0.3 * 60, 3);
    expect(t.radiusM).toBe(400);
    expect(t.location.lng).toBeGreaterThan(77);
    expect(triggerFor(route, { anchorRouteDistanceM: 100, durationS: 60, avgSpeedMps: 20 }).routeDistanceM).toBe(0);
    expect(triggerFor(route, { anchorRouteDistanceM: 0, durationS: 30, avgSpeedMps: 20, radiusM: 1000 }).radiusM).toBe(1000);
  });
});
