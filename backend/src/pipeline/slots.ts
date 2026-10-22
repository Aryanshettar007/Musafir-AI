import type { RouteIndex } from "../geo";
import { chainBrands, chainWord, clusterEpisodes, dedupeArticles, dedupeChains, passesFilter, passesTownFilter, rank, type Prepared } from "./candidates";
import { INTERCITY_RULES, SHORTLIST_SIZE, SHORTLIST_TOWNS, type TripRules } from "./rules";
import type { Candidate } from "./types";

// Candidates that survived the filters, ready for slot selection.
export interface Pool {
  strict: Candidate[]; // episodes, single POIs and food, strict filters, chains and duplicate articles removed
  relaxed: Candidate[]; // what only the relaxed filters let through (used for empty slots)
  towns: Candidate[];
  regions: Candidate[];
}

export function buildPool(prepared: Prepared, rules: TripRules = INTERCITY_RULES): Pool {
  const chains = rules.skipFoodChains ? chainBrands(prepared.pois.filter((c) => c.kind === "food")) : new Set<string>();
  const pois = prepared.pois.filter((c) => c.kind !== "food" || !chains.has(chainWord(c.name) ?? ""));
  const strictFood = dedupeChains(pois.filter((c) => c.kind === "food" && passesFilter(c, "strict", rules)));
  const strictStories = dedupeArticles(pois.filter((c) => c.kind === "poi" && passesFilter(c, "strict", rules)));
  const { episodes, singles } = clusterEpisodes(strictStories, rules);
  const strict = [...episodes, ...singles, ...strictFood];

  const used = new Set(strict.flatMap((c) => (c.members ?? [c]).map((m) => m.key)));
  const relaxedFood = dedupeChains(pois.filter((c) => c.kind === "food" && !used.has(c.key) && passesFilter(c, "relaxed", rules)));
  const relaxedStories = dedupeArticles(pois.filter((c) => c.kind === "poi" && !used.has(c.key) && passesFilter(c, "relaxed", rules)));
  const usedArticles = new Set(strict.flatMap((c) => (c.members ?? [c]).flatMap((m) => (m.article ? [m.article.pageId] : []))));
  const relaxed = [...relaxedStories, ...relaxedFood].filter((c) => !c.article || !usedArticles.has(c.article.pageId));

  return {
    strict, relaxed, towns: prepared.towns.filter((c) => passesTownFilter(c, rules)), regions: rules.towns ? prepared.regions : [],
  };
}

export interface Slot {
  index: number;
  fromM: number;
  toM: number;
  candidates: Candidate[]; // best first; may hold relaxed candidates, or a region (long-form) when nothing else exists
  towns: Candidate[]; // towns the slot passes through, most important first
  relaxed: boolean; // candidates came from the relaxed filters
}

// slots = clamp(round(durationMin / 10), 3, 60): Mysuru is about 15, Mumbai 60. A local trip uses 3-minute slots.
export function slotCount(durationS: number, rules: TripRules = INTERCITY_RULES): number {
  return Math.max(rules.minSlots, Math.min(rules.maxSlots, Math.round(durationS / 60 / rules.slotMinutes)));
}

export const slotIndex = (m: number, totalM: number, count: number) =>
  Math.max(0, Math.min(count - 1, Math.floor((m / Math.max(totalM, 1)) * count)));

const byRank = (a: Candidate, b: Candidate) => rank(b) - rank(a);

// The route cut into equal stretches, each with a shortlist: top 3 candidates anchored in it plus its towns. An empty
// slot is retried with the relaxed filters, then falls back to its most important town, then to a long-form story
// about its best region; otherwise it stays empty.
export function buildSlots(pool: Pool, route: RouteIndex, durationS: number, rules: TripRules = INTERCITY_RULES): Slot[] {
  const count = slotCount(durationS, rules);
  const len = route.totalM / count;
  const at = (c: Candidate) => slotIndex(c.routeDistanceM, route.totalM, count);
  const slots: Slot[] = Array.from({ length: count }, (_, index) => ({
    index, fromM: index * len, toM: (index + 1) * len, candidates: [], towns: [], relaxed: false,
  }));

  const group = (list: Candidate[]) => {
    const g: Candidate[][] = Array.from({ length: count }, () => []);
    for (const c of list) g[at(c)].push(c);
    return g;
  };
  const strict = group(pool.strict), relaxed = group(pool.relaxed), towns = group(pool.towns), regions = group(pool.regions);

  for (const slot of slots) {
    const i = slot.index;
    slot.towns = towns[i].sort(byRank).slice(0, SHORTLIST_TOWNS);
    slot.candidates = strict[i].sort(byRank).slice(0, SHORTLIST_SIZE);
    if (slot.candidates.length === 0 && relaxed[i].length > 0) {
      slot.candidates = relaxed[i].sort(byRank).slice(0, SHORTLIST_SIZE);
      slot.relaxed = true;
    }
    if (slot.candidates.length === 0 && slot.towns.length === 0 && regions[i].length > 0) {
      slot.candidates = [regions[i].sort(byRank)[0]];
    }
  }
  return slots;
}
