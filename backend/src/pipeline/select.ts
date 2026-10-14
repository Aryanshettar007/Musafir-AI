import type { InterestId } from "../catalog/interests";
import type { GeminiClient } from "../clients/gemini";
import type { RouteIndex } from "../geo";
import type { Prepared } from "./candidates";
import { curate, type Curated } from "./curate";
import { addMustSee, fallbackPicks, limitFood } from "./plan";
import { buildPool, buildSlots, type Pool, type Slot } from "./slots";
import type { PlannedItem } from "./types";

export interface SelectInput {
  route: RouteIndex;
  durationS: number;
  prepared: Prepared;
  interests: readonly InterestId[];
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

// Slots, shortlists, curator (or fallback), must-see places that lost their slot, then the food limit. Spacing comes
// after the intro and sponsor exist.
export async function selectPicks(gemini: GeminiClient | undefined, input: SelectInput): Promise<Selection> {
  const { route, durationS, prepared, interests } = input;
  const pool = buildPool(prepared);
  const slots = buildSlots(pool, route, durationS);
  const v = avgSpeedMps({ distanceM: route.totalM, durationS });
  const curated: Curated = gemini
    ? await curate(gemini, { slots, interests, durationS, totalM: route.totalM })
    : { items: fallbackPicks(slots, interests, route.totalM), source: "fallback" };
  const picks = limitFood(addMustSee(curated.items, pool, slots, interests, route.totalM), v);
  return { picks, slots, pool, source: curated.source, model: curated.model, note: curated.note };
}
