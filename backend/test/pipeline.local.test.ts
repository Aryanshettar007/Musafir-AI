import { describe, expect, it } from "vitest";
import { clusterEpisodes, passesFilter, passesTownFilter, poiScore, prepare } from "../src/pipeline/candidates";
import { isWikiSight } from "../src/pipeline/classify";
import { isCityTitle, labelTokens, matchArticle, sameName } from "../src/pipeline/match";
import { curate } from "../src/pipeline/curate";
import { enforceSpacing, introItem, plan } from "../src/pipeline/plan";
import { INTERCITY_RULES, LOCAL_RULES, rulesFor } from "../src/pipeline/rules";
import { withoutExtraFood } from "../src/pipeline/select";
import { buildPool, slotCount, type Slot } from "../src/pipeline/slots";
import type { Candidate } from "../src/pipeline/types";
import { fakeGemini } from "./helpers/fakes";
import { indexRoute, type LatLng } from "../src/geo";

// A straight 10 km route going east along lat 12, like a drive across a city centre.
const line: LatLng[] = Array.from({ length: 101 }, (_, i) => ({ lat: 12, lng: 77 + i * 0.000917 }));
const route = indexRoute(line);
const at = (km: number, offsetM = 0): LatLng => ({ lat: 12 + offsetM / 111_000, lng: 77 + (km * 1000) / (111_320 * Math.cos((12 * Math.PI) / 180)) });

let n = 0;
function cand(over: Partial<Candidate> & { km: number }): Candidate {
  const { km, ...rest } = over;
  return {
    key: `k${++n}`, kind: "poi", name: `Place ${n}`, location: at(km), types: ["tourist_attraction"], ratings: 5000, interests: [],
    distanceFromRouteM: 0, routeDistanceM: km * 1000, side: "left", historic: false, inEdge: false, score: 4, heard: false, ...rest,
  };
}

describe("trip mode", () => {
  it("is local up to 40 km and intercity beyond", () => {
    expect(rulesFor(9_400).mode).toBe("local");
    expect(rulesFor(40_000).mode).toBe("local");
    expect(rulesFor(145_000).mode).toBe("intercity");
  });

  it("cuts a 30 minute city drive into 3-minute slots", () => {
    expect(slotCount(30 * 60, LOCAL_RULES)).toBe(10);
    expect(slotCount(30 * 60, INTERCITY_RULES)).toBe(3);
  });
});

describe("Wikipedia-only sights", () => {
  it.each([
    ["Vidhana Soudha", "Seat of legislature of Karnataka State", true],
    ["Cubbon Park", "Neighbourhood in Bengaluru Urban, Karnataka, India", true], // the title saves a wrong description
    ["Fort Church, Bengaluru", "Church in Bangalore Fort, India", true],
    ["Bengaluru", "Capital of Karnataka, India", false],
    ["United Mission School", "Government aided, private school in Bangalore, India", false],
    ["Cubbon Park metro station", "Namma Metro's Purple Line metro station", false],
    ["Palace Guttahalli", "Neighbourhood in Bengaluru", false],
    ["Siege of Bangalore", "1791 siege of the Third Anglo-Mysore War", false],
  ])("%s -> %s", (title, description, expected) => {
    expect(isWikiSight(title, description)).toBe(expected);
  });

  it("become candidates on a local trip when long enough and not matched to a Google place", () => {
    const input = {
      route, originLabel: "Start", destinationLabel: "End",
      google: [{ id: "g1", name: "Shiva Temple", location: at(3, 100), primaryType: "hindu_temple", types: ["hindu_temple"], userRatingCount: 9000 }],
      wiki: [
        { pageId: 1, title: "Shiva Temple, Somewhere", location: at(3, 120), description: "Hindu temple in India", length: 20_000 },
        { pageId: 2, title: "Vidhana Soudha", location: at(5, 400), description: "Seat of legislature of Karnataka State", length: 24_000 },
        { pageId: 3, title: "Tiny Shrine", location: at(6), description: "Hindu temple in India", length: 2_000 },
        { pageId: 4, title: "Some School", location: at(7), description: "Private school in India", length: 30_000 },
        { pageId: 5, title: "Far Palace", location: at(8, 5_000), description: "Palace in India", length: 30_000 },
      ],
    };
    const local = prepare({ ...input, rules: LOCAL_RULES });
    expect(local.pois.map((p) => p.key)).toEqual(["g1", "wiki:2"]);
    const vidhana = local.pois[1];
    expect(vidhana.score).toBeCloseTo(Math.log10(24_001) - 0.3 * (vidhana.distanceFromRouteM / 1000), 5); // no article bonus
    expect(prepare(input).pois.map((p) => p.key)).toEqual(["g1"]); // intercity: articles only enrich Google places
  });
});

describe("local scoring, matching and towns", () => {
  it("gives a matched article a smaller bonus in a city", () => {
    const base = { ratings: 999, historic: false, distanceFromRouteM: 0, inEdge: false };
    const withArticle = { ...base, article: { pageId: 1, title: "x", location: at(1) } };
    expect(poiScore(withArticle, LOCAL_RULES)).toBeCloseTo(3.5, 5);
    expect(poiScore(withArticle, INTERCITY_RULES)).toBeCloseTo(4.5, 5);
  });

  it("matches names that only differ in spacing", () => {
    const article = { pageId: 9, title: "Lal Bagh", location: at(5, 600), description: "Botanical Garden in Karnataka, India" };
    expect(matchArticle("Lalbagh Botanical Garden", at(5), [article])?.pageId).toBe(9);
  });

  it("has no town welcomes", () => {
    const town = cand({ km: 8, kind: "town" });
    expect(passesTownFilter(town, INTERCITY_RULES)).toBe(true);
    expect(passesTownFilter(town, LOCAL_RULES)).toBe(false);
  });
});

describe("local clusters and spacing", () => {
  it("keeps famous neighbours as separate stories", () => {
    const sights = [cand({ km: 2 }), cand({ km: 3 }), cand({ km: 4 })]; // 1 km apart
    expect(clusterEpisodes(sights, INTERCITY_RULES).episodes).toHaveLength(1);
    const local = clusterEpisodes(sights, LOCAL_RULES);
    expect(local.episodes).toHaveLength(0);
    expect(local.singles).toHaveLength(3);
  });

  it("does not boost a city cluster above its best member", () => {
    const close = [cand({ km: 2, score: 4 }), cand({ km: 2.1, score: 3 }), cand({ km: 2.2, score: 3 })];
    expect(clusterEpisodes(close, LOCAL_RULES).episodes[0].score).toBe(4);
  });

  it("fits stories 400 m apart at city speed", () => {
    const v = 5; // m/s
    const items = [2, 2.4, 2.8].map((km) => plan("story", cand({ km }), "general", { fromM: 0 }, route.totalM, LOCAL_RULES));
    expect(items[0].targetSeconds).toBe(45);
    expect(enforceSpacing(items, v, route.totalM, LOCAL_RULES)).toHaveLength(3); // (45 + 20) s x 5 m/s = 325 m
    const intercity = [2, 2.4, 2.8].map((km) => plan("story", cand({ km }), "general", { fromM: 0 }, route.totalM));
    // (60 + 60) s x 5 m/s = 600 m: the 2.4 km story goes.
    expect(enforceSpacing(intercity, v, route.totalM).map((i) => i.anchorRouteDistanceM)).toEqual([2000, 2800]);
  });
});

describe("food limit stand-ins", () => {
  it("replaces a food pick the limit removes with the best non-food place of its slot", () => {
    const v = 5;
    const food1 = cand({ km: 1, kind: "food", score: 5 });
    const food2 = cand({ km: 3.5, kind: "food", score: 3 }); // 2.5 km after food1: inside the 15-minute food gap
    const lalbagh = cand({ km: 3.6, score: 4, interests: ["nature"] });
    const slots: Slot[] = [
      { index: 0, fromM: 0, toM: 2500, candidates: [food1], towns: [], relaxed: false },
      { index: 1, fromM: 2500, toM: 5000, candidates: [food2, lalbagh], towns: [], relaxed: false },
    ];
    const picks = [food1, food2].map((c) => plan("food", c, "food", { fromM: 0 }, 5000, LOCAL_RULES));
    const out = withoutExtraFood(picks, slots, ["history"], v, 5000, LOCAL_RULES);
    expect(out.map((p) => [p.type, p.candidate?.key])).toEqual([["food", food1.key], ["story", lalbagh.key]]);
  });
});

describe("the starting landmark", () => {
  it("moves just past the intro on a local trip instead of being dropped", () => {
    const v = 5;
    const palace = plan("story", cand({ km: 0 }), "history", { fromM: 0 }, route.totalM, LOCAL_RULES);
    const local = enforceSpacing([introItem("A to B", LOCAL_RULES), palace], v, route.totalM, LOCAL_RULES);
    expect(local.map((i) => [i.type, i.anchorRouteDistanceM])).toEqual([["trip-intro", 0], ["story", (20 + 20) * v]]);
    const intercity = enforceSpacing([introItem("A to B"), plan("story", cand({ km: 0 }), "history", { fromM: 0 }, route.totalM)], v, route.totalM);
    expect(intercity.map((i) => i.type)).toEqual(["trip-intro"]);
  });
});

describe("curator fame signals", () => {
  it("shows review counts and keeps a focus only when the place fits it", async () => {
    const slots: Slot[] = [{
      index: 0, fromM: 0, toM: 3000, towns: [], relaxed: false,
      candidates: [
        cand({ km: 1, name: "Big Stadium", ratings: 52_373 }),
        cand({ km: 1.2, name: "Vidhana Soudha", ratings: 0, article: { pageId: 2, title: "Vidhana Soudha", location: at(1.2) } }),
      ],
    }];
    const gemini = fakeGemini([{ picks: [{ slot: 0, candidateId: "s0c0", type: "story", focus: "food" }] }]);
    const out = await curate(gemini, { slots, interests: ["history", "food"], durationS: 1800, totalM: 3000, rules: LOCAL_RULES });
    expect(gemini.calls[0].prompt).toContain("s0c0: Big Stadium | poi | 52k Google reviews | left side");
    expect(gemini.calls[0].prompt).toContain("s0c1: Vidhana Soudha | poi | no Google reviews, has a Wikipedia article");
    expect(gemini.calls[0].system).toContain("famous landmark of the city or region beats a minor place");
    expect(gemini.calls[0].system).toContain("every 3 minutes or so");
    expect(out.items[0].focus).toBe("general"); // a stadium has nothing to say about food
  });
});

describe("matching around the trip's own city", () => {
  const exclude = labelTokens("Bangalore Palace, Bengaluru", "Bull Temple, Basavanagudi, Bengaluru");

  it("never matches the city's own article to a place in it", () => {
    const city = { pageId: 1, title: "Bengaluru", location: at(0, 500), description: "Capital of Karnataka, India" };
    expect(isCityTitle("Bengaluru", exclude)).toBe(true);
    expect(isCityTitle("Bangalore Palace", exclude)).toBe(false);
    expect(matchArticle("Bengaluru Palace", at(0), [city], { exclude, maxDistanceM: 5_000 })).toBeUndefined();
  });

  it("matches a city-plus-generic name only to the same name", () => {
    const church = { pageId: 2, title: "Fort Church, Bengaluru", location: at(0, 200), description: "Church in Bangalore Fort, India" };
    const fort = { pageId: 3, title: "Bangalore Fort", location: at(0, 300), description: "Historic mud fort in Karnataka, India" };
    expect(matchArticle("Bengaluru Fort", at(0), [church], { exclude })).toBeUndefined();
    expect(matchArticle("Bengaluru Fort", at(0), [church, fort], { exclude })?.pageId).toBe(3);
  });

  it("compares names across old and new city spellings", () => {
    expect(sameName("Bangalore Palace", "Bengaluru Palace")).toBe(true);
    expect(sameName("Fort Church, Bengaluru", "Fort Church")).toBe(true);
    expect(sameName("Bengaluru", "Bengaluru Palace")).toBe(false);
  });
});

describe("local filter and curator fame", () => {
  it("shortlists a place without an article only when it is famous", () => {
    expect(passesFilter(cand({ km: 1, ratings: 3_275 }), "strict", LOCAL_RULES)).toBe(false); // Sringeri Math branch
    expect(passesFilter(cand({ km: 1, ratings: 143_233 }), "strict", LOCAL_RULES)).toBe(true); // Cubbon Park
    expect(passesFilter(cand({ km: 1, ratings: 2_000, article: { pageId: 1, title: "x", location: at(1) } }), "strict", LOCAL_RULES)).toBe(true);
    expect(passesFilter(cand({ km: 1, ratings: 3_275 }), "strict", INTERCITY_RULES)).toBe(true); // a town can lend facts
  });

  it("replaces a pick ten times less popular than its slot's best of the same kind", async () => {
    const stadium = cand({ km: 1, name: "Big Stadium", ratings: 52_373, score: 4.8 });
    const small = cand({ km: 1.1, name: "Small Museum", ratings: 2_384, score: 3.4 });
    const cafe = cand({ km: 1.2, name: "Cafe", kind: "food", ratings: 900, score: 2.9 });
    const slots: Slot[] = [{ index: 0, fromM: 0, toM: 3000, towns: [], relaxed: false, candidates: [stadium, small, cafe] }];
    const pick = (id: string, type: "story" | "food") => fakeGemini([{ picks: [{ slot: 0, candidateId: id, type, focus: "general" }] }]);
    const input = { slots, interests: ["history"] as const, durationS: 1800, totalM: 3000, rules: LOCAL_RULES };
    expect((await curate(pick("s0c1", "story"), input)).items[0].title).toBe("Big Stadium");
    // A food pick is compared with food only: the cafe stays.
    expect((await curate(pick("s0c2", "food"), input)).items[0].title).toBe("Cafe");
  });
});

describe("food chains in a city", () => {
  it("leaves out brands with two or more branches on a local trip only", () => {
    const food = (name: string, km: number) => cand({ km, name, kind: "food", ratings: 20_000 });
    const prepared = {
      pois: [food("Empire Restaurant Majestic", 1), food("Empire Restaurant vasanth nagar", 3), food("Vidyarthi Bhavan", 5)],
      towns: [], regions: [], landmarks: [], counts: { landmark: 0, town: 0, region: 0, junk: 0 },
    };
    expect(buildPool(prepared, LOCAL_RULES).strict.map((c) => c.name)).toEqual(["Vidyarthi Bhavan"]);
    expect(buildPool(prepared, INTERCITY_RULES).strict).toHaveLength(3); // between cities a chain stop is fine
  });
});
