import type { InterestId } from "../catalog/interests";
import type { SponsoredItemSpec } from "../services/sponsor/types";
import {
  FOOD_MIN_GAP_S, INTRO_TRIGGER_RADIUS_M, MAJOR_TOWN_LENGTH, MUST_SEE_RATINGS, SIDE_NONE_END_M, SPACING_PADDING_S, TARGET_SECONDS,
  TOWN_WELCOME_LEAD_M,
} from "./rules";
import { rank } from "./candidates";
import { slotIndex, type Pool, type Slot } from "./slots";
import { placeKeysOf, type Candidate, type Focus, type PlannedItem, type RealItemType, type Side } from "./types";

// Where an item is "about", per type (trip spec 5.4.5): closest approach (story, food), anchor member (episode),
// 1 km before the town's closest approach (town-welcome), start of the slot (long-form). Side is none for towns and
// long-form, near the route ends and for episodes with members on both sides.
export function plan(type: RealItemType, c: Candidate, focus: Focus, slot: Pick<Slot, "fromM">, totalM: number): PlannedItem {
  const anchor = type === "town-welcome" ? Math.max(0, c.routeDistanceM - TOWN_WELCOME_LEAD_M) : type === "long-form" ? slot.fromM : c.routeDistanceM;
  let side: Side = c.side;
  if (type === "town-welcome" || type === "long-form") side = "none";
  else if (type === "episode") side = new Set((c.members ?? [c]).map((m) => m.side)).size > 1 ? "none" : c.side;
  if (nearEnds(c.routeDistanceM, totalM)) side = "none";
  return { type, candidate: c, focus, side, targetSeconds: TARGET_SECONDS[type], anchorRouteDistanceM: anchor, score: rank(c), title: c.name };
}

const nearEnds = (m: number, totalM: number) => m < SIDE_NONE_END_M || m > totalM - SIDE_NONE_END_M;

export function introItem(title: string): PlannedItem {
  return {
    type: "trip-intro", focus: "general", side: "none", targetSeconds: TARGET_SECONDS["trip-intro"], anchorRouteDistanceM: 0, score: Infinity,
    title, locked: true, triggerRadiusM: INTRO_TRIGGER_RADIUS_M,
  };
}

export function sponsoredItem(spec: SponsoredItemSpec): PlannedItem {
  return {
    type: "sponsored", focus: "general", side: spec.side, targetSeconds: spec.audio.durationS, anchorRouteDistanceM: spec.anchorRouteDistanceM,
    score: Infinity, title: spec.title, locked: true, triggerRadiusM: spec.triggerRadiusM, sponsor: spec,
  };
}

// The user's interest this candidate speaks to, else "general".
export function focusFor(c: Candidate, interests: readonly InterestId[]): Focus {
  return interests.find((i) => c.interests.includes(i)) ?? "general";
}

// What the first spec rule says a candidate of this kind may be written as.
export function allowedTypes(c: Candidate): RealItemType[] {
  switch (c.kind) {
    case "poi": return ["story"];
    case "food": return ["food"];
    case "episode": return ["episode"];
    case "town": return ["town-welcome", "long-form"];
    case "region": return ["long-form"];
  }
}

export const defaultType = (c: Candidate): RealItemType => allowedTypes(c)[0];

// No curator needed: the top shortlist entry of every slot, a town for slots with nothing else (or a major town), and
// the long-form region the slot builder already put in an otherwise empty slot.
export function fallbackPicks(slots: readonly Slot[], interests: readonly InterestId[], totalM: number): PlannedItem[] {
  const out: PlannedItem[] = [];
  for (const slot of slots) {
    const top = slot.candidates[0];
    if (top) out.push(plan(defaultType(top), top, focusFor(top, interests), slot, totalM));
    const town = slot.towns[0];
    if (town && (!top || (town.article?.length ?? 0) >= MAJOR_TOWN_LENGTH)) out.push(plan("town-welcome", town, "general", slot, totalM));
  }
  return out;
}

// Very famous places (MUST_SEE_RATINGS) that lost their slot to another pick still join the trip; spacing then keeps
// the better of two that collide. Food is left to the food limit.
export function addMustSee(picks: readonly PlannedItem[], pool: Pool, slots: readonly Slot[], interests: readonly InterestId[], totalM: number): PlannedItem[] {
  const used = new Set(picks.flatMap(placeKeysOf));
  const out = [...picks];
  for (const c of [...pool.strict].sort((a, b) => rank(b) - rank(a))) {
    if (c.kind === "food" || c.ratings < MUST_SEE_RATINGS) continue;
    const keys = (c.members ?? [c]).map((m) => m.key);
    if (keys.some((k) => used.has(k))) continue;
    const slot = slots[slotIndex(c.routeDistanceM, totalM, slots.length)] ?? { fromM: 0 };
    out.push(plan(defaultType(c), c, focusFor(c, interests), slot, totalM));
    keys.forEach((k) => used.add(k));
  }
  return out;
}

// At most one food item per 45 minutes of driving; the lower-scoring of two close ones is dropped.
export function limitFood(items: readonly PlannedItem[], avgSpeedMps: number): PlannedItem[] {
  const gapM = FOOD_MIN_GAP_S * avgSpeedMps;
  const out: PlannedItem[] = [];
  for (const it of [...items].sort((a, b) => a.anchorRouteDistanceM - b.anchorRouteDistanceM)) {
    if (it.type !== "food") {
      out.push(it);
      continue;
    }
    const lastFood = out.filter((x) => x.type === "food").at(-1);
    if (!lastFood || it.anchorRouteDistanceM - lastFood.anchorRouteDistanceM >= gapM) out.push(it);
    else if (it.score > lastFood.score) out.splice(out.indexOf(lastFood), 1, it);
  }
  return out;
}

function shortened(it: PlannedItem, totalM: number): PlannedItem | undefined {
  if (it.locked || !it.candidate || (it.type !== "episode" && it.type !== "long-form")) return undefined;
  const candidate = it.type === "episode" ? (it.candidate.anchor ?? it.candidate) : it.candidate;
  const side: Side = it.type === "episode" && !nearEnds(candidate.routeDistanceM, totalM) ? candidate.side : "none";
  return { ...it, type: "story", candidate, side, targetSeconds: TARGET_SECONDS.story };
}

// The next anchor must be at least targetSeconds(prev) + 60 s of driving after the previous one. A violation first
// shortens an episode or long-form to a story, then drops the lower-scoring item. Locked items (trip-intro,
// sponsored) are never dropped or shortened, so their neighbours give way.
export function enforceSpacing(items: readonly PlannedItem[], avgSpeedMps: number, totalM: number): PlannedItem[] {
  const needM = (p: PlannedItem) => (p.targetSeconds + SPACING_PADDING_S) * avgSpeedMps;
  const out: PlannedItem[] = [];
  for (let cur of [...items].sort((a, b) => a.anchorRouteDistanceM - b.anchorRouteDistanceM)) {
    for (;;) {
      const prev = out.at(-1);
      if (!prev || cur.anchorRouteDistanceM - prev.anchorRouteDistanceM >= needM(prev)) {
        out.push(cur);
        break;
      }
      if (prev.locked && cur.locked) {
        out.push(cur); // two fixed items that collide: nothing to give way
        break;
      }
      // Shorten the longer of the two that can be shortened.
      const options = [prev, cur].filter((x) => shortened(x, totalM)).sort((a, b) => b.targetSeconds - a.targetSeconds);
      const target = options[0];
      if (target === prev) {
        out[out.length - 1] = shortened(prev, totalM)!;
        continue;
      }
      if (target === cur) {
        cur = shortened(cur, totalM)!;
        continue;
      }
      // Nothing to shorten: drop the lower-scoring item (a locked one always stays).
      if (prev.locked || (!cur.locked && cur.score <= prev.score)) break; // drop cur
      out.pop(); // drop prev, then check cur against the one before it
    }
  }
  return out;
}

// Trip-intro first, the sponsored item if any, then everything in route order with spacing enforced.
export function finalizeItems(picks: readonly PlannedItem[], opts: { intro: PlannedItem; sponsor?: PlannedItem; avgSpeedMps: number; totalM: number }): PlannedItem[] {
  const all = [opts.intro, ...(opts.sponsor ? [opts.sponsor] : []), ...picks.filter((p) => !p.locked)];
  return enforceSpacing(all, opts.avgSpeedMps, opts.totalM);
}

// Same-slot replacements for an item dropped for lack of facts (spacing ran before facts were known): the slot's other
// shortlist entries, then its towns as town-welcomes, best first, skipping places already in the trip.
export function alternativesFor(
  dropped: PlannedItem, slots: readonly Slot[], usedKeys: ReadonlySet<string>, interests: readonly InterestId[], totalM: number,
): PlannedItem[] {
  if (!dropped.candidate || slots.length === 0) return [];
  const slot = slots[slotIndex(dropped.candidate.routeDistanceM, totalM, slots.length)];
  const fresh = (p: PlannedItem) => placeKeysOf(p).every((k) => !usedKeys.has(k));
  return [
    ...slot.candidates.map((c) => plan(defaultType(c), c, focusFor(c, interests), slot, totalM)),
    ...slot.towns.map((t) => plan("town-welcome", t, "general", slot, totalM)),
  ].filter(fresh);
}

// Whether `item` can join the already spaced `items` without breaking the spacing rule or the food limit.
export function fitsSpacing(item: PlannedItem, items: readonly PlannedItem[], avgSpeedMps: number): boolean {
  const needM = (p: PlannedItem) => (p.targetSeconds + SPACING_PADDING_S) * avgSpeedMps;
  const sorted = [...items].sort((a, b) => a.anchorRouteDistanceM - b.anchorRouteDistanceM);
  const prev = sorted.filter((x) => x.anchorRouteDistanceM <= item.anchorRouteDistanceM).at(-1);
  const next = sorted.find((x) => x.anchorRouteDistanceM > item.anchorRouteDistanceM);
  if (prev && item.anchorRouteDistanceM - prev.anchorRouteDistanceM < needM(prev)) return false;
  if (next && next.anchorRouteDistanceM - item.anchorRouteDistanceM < needM(item)) return false;
  const foodGapM = FOOD_MIN_GAP_S * avgSpeedMps;
  return item.type !== "food" || !items.some((x) => x.type === "food" && Math.abs(x.anchorRouteDistanceM - item.anchorRouteDistanceM) < foodGapM);
}
