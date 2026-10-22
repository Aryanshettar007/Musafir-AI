import type { InterestId } from "../catalog/interests";
import type { GeminiClient } from "../clients/gemini";
import type { RouteIndex } from "../geo";
import type { Prepared } from "./candidates";
import { curate, type Curated } from "./curate";
import { defaultType, fallbackPicks, focusFor, limitFood, plan } from "./plan";
import { buildPool, buildSlots, slotIndex, type Pool, type Slot } from "./slots";
import { INTERCITY_RULES, type TripRules } from "./rules";
import { placeKeysOf, type PlannedItem } from "./types";

export interface SelectInput {
  route: RouteIndex;
  durationS: number;
  prepared: Prepared;
  interests: readonly InterestId[];
  rules?: TripRules;
}

export interface Selection {
  picks: PlannedItem[]; // not yet spaced: the trip builder adds the intro and sponsor, then enforces spacing
  slots: Slot[];
  pool: Pool;
  source: Curated["source"];
  model?: string;
  note?: string;
}

export const avgSpeedMps = (route: { distanceM: number; durationS: number }) => route.distanceM / Math.max(route.durationS, 1);

// Slots, shortlists, curator (or fallback), then the food limit. Spacing comes after the intro and sponsor exist.
export async function selectPicks(gemini: GeminiClient | undefined, input: SelectInput): Promise<Selection> {
  const { route, durationS, prepared, interests } = input;
  const rules = input.rules ?? INTERCITY_RULES;
  const pool = buildPool(prepared, rules);
  const slots = buildSlots(pool, route, durationS, rules);
  const v = avgSpeedMps({ distanceM: route.totalM, durationS });
  const curated: Curated = gemini
    ? await curate(gemini, { slots, interests, durationS, totalM: route.totalM, rules })
    : { items: fallbackPicks(slots, interests, route.totalM, rules), source: "fallback" };
  return { picks: withoutExtraFood(curated.items, slots, interests, v, route.totalM, rules), slots, pool, source: curated.source, model: curated.model, note: curated.note };
}

// The food limit, then a stand-in for every food pick it removed: the best non-food place of that slot not already in
// the trip. Without it a curator that picks food in many slots ("history, food" listener) leaves holes; the
// Bangalore Palace -> Bull Temple trip lost Lalbagh and Tipu's Palace that way.
export function withoutExtraFood(
  items: readonly PlannedItem[], slots: readonly Slot[], interests: readonly InterestId[], v: number, totalM: number, rules: TripRules,
): PlannedItem[] {
  const kept = limitFood(items, v, rules);
  const used = new Set(kept.flatMap(placeKeysOf));
  const out = [...kept];
  for (const dropped of items) {
    if (kept.includes(dropped) || !dropped.candidate || slots.length === 0) continue;
    const slot = slots[slotIndex(dropped.candidate.routeDistanceM, totalM, slots.length)];
    const c = slot.candidates.find((x) => x.kind !== "food" && (x.members ?? [x]).every((m) => !used.has(m.key)));
    if (!c) continue;
    const stand = plan(defaultType(c), c, focusFor(c, interests), slot, totalM, rules);
    placeKeysOf(stand).forEach((k) => used.add(k));
    out.push(stand);
  }
  return out.sort((a, b) => a.anchorRouteDistanceM - b.anchorRouteDistanceM);
}
