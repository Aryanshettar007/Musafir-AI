import type { RouteIndex } from "../geo";
import { clusterEpisodes, dedupeArticles, dedupeChains, passesFilter, passesTownFilter, rank, type Prepared } from "./candidates";
import { FIRST_HOUR_MINUTES, FIRST_HOUR_SLOT_MINUTES, MAX_SLOTS, MIN_SLOTS, SHORTLIST_SIZE, SHORTLIST_TOWNS, SLOT_MINUTES } from "./rules";
import type { Candidate } from "./types";

// Candidates that survived the filters, ready for slot selection.
export interface Pool {
  strict: Candidate[]; // episodes, single POIs and food, strict filters, chains and duplicate articles removed
  relaxed: Candidate[]; // what only the relaxed filters let through (used for empty slots)
  local: Candidate[]; // what only the local filter lets through (used for slots still empty)
  towns: Candidate[];
  regions: Candidate[];
}

export function buildPool(prepared: Prepared): Pool {
  const { pois } = prepared;
  const strictFood = dedupeChains(pois.filter((c) => c.kind === "food" && passesFilter(c)));
  const strictStories = dedupeArticles(pois.filter((c) => c.kind === "poi" && passesFilter(c)));
  const { episodes, singles } = clusterEpisodes(strictStories);
  const strict = [...episodes, ...singles, ...strictFood];

  const used = new Set(strict.flatMap((c) => (c.members ?? [c]).map((m) => m.key)));
  const relaxedFood = dedupeChains(pois.filter((c) => c.kind === "food" && !used.has(c.key) && passesFilter(c, "relaxed")));
  const relaxedStories = dedupeArticles(pois.filter((c) => c.kind === "poi" && !used.has(c.key) && passesFilter(c, "relaxed")));
  const usedArticles = new Set(strict.flatMap((c) => (c.members ?? [c]).flatMap((m) => (m.article ? [m.article.pageId] : []))));
  const relaxed = [...relaxedStories, ...relaxedFood].filter((c) => !c.article || !usedArticles.has(c.article.pageId));

  for (const c of relaxed) {
    used.add(c.key);
    if (c.article) usedArticles.add(c.article.pageId);
  }
  const localFood = dedupeChains(pois.filter((c) => c.kind === "food" && !used.has(c.key) && passesFilter(c, "local")));
  const localStories = dedupeArticles(pois.filter((c) => c.kind === "poi" && !used.has(c.key) && passesFilter(c, "local")));
  const local = [...localStories, ...localFood].filter((c) => !c.article || !usedArticles.has(c.article.pageId));

  return { strict, relaxed, local, towns: prepared.towns.filter(passesTownFilter), regions: prepared.regions };
}

export interface Slot {
  index: number;
  fromM: number;
  toM: number;
  candidates: Candidate[]; // best first; may hold relaxed candidates, or a region (long-form) when nothing else exists
  towns: Candidate[]; // towns the slot passes through, most important first
  relaxed: boolean; // candidates came from the relaxed filters
}

// One slot per 6 minutes of the first hour, then one per 10 minutes, clamped to 3..60: 30 min is 5, Mysuru (151 min)
// about 19, Mumbai 60. Slots stay equal stretches of the route; only their number follows this rule.
export function slotCount(durationS: number): number {
  const minutes = durationS / 60;
  const firstHour = Math.min(minutes, FIRST_HOUR_MINUTES);
  const slots = firstHour / FIRST_HOUR_SLOT_MINUTES + Math.max(0, minutes - FIRST_HOUR_MINUTES) / SLOT_MINUTES;
  return Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.round(slots)));
}

export const slotIndex = (m: number, totalM: number, count: number) =>
  Math.max(0, Math.min(count - 1, Math.floor((m / Math.max(totalM, 1)) * count)));

const byRank = (a: Candidate, b: Candidate) => rank(b) - rank(a);

// The route cut into equal stretches, each with a shortlist: top 3 candidates anchored in it plus its towns. An empty
// slot is retried with the relaxed filters, then with local places close to the road, then falls back to its most
// important town, then to a long-form story about its best region; otherwise it stays empty.
export function buildSlots(pool: Pool, route: RouteIndex, durationS: number): Slot[] {
  const count = slotCount(durationS);
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
  const strict = group(pool.strict), relaxed = group(pool.relaxed), local = group(pool.local), towns = group(pool.towns), regions = group(pool.regions);

  for (const slot of slots) {
    const i = slot.index;
    slot.towns = towns[i].sort(byRank).slice(0, SHORTLIST_TOWNS);
    slot.candidates = strict[i].sort(byRank).slice(0, SHORTLIST_SIZE);
    if (slot.candidates.length === 0 && relaxed[i].length > 0) {
      slot.candidates = relaxed[i].sort(byRank).slice(0, SHORTLIST_SIZE);
      slot.relaxed = true;
    }
    if (slot.candidates.length === 0 && slot.towns.length === 0 && local[i].length > 0) {
      slot.candidates = local[i].sort(byRank).slice(0, SHORTLIST_SIZE);
      slot.relaxed = true;
    }
    if (slot.candidates.length === 0 && slot.towns.length === 0 && regions[i].length > 0) {
      slot.candidates = [regions[i].sort(byRank)[0]];
    }
  }
  return slots;
}
