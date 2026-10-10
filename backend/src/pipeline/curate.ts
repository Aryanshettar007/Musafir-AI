import { z } from "zod";
import { INTEREST_IDS, type InterestId } from "../catalog/interests";
import type { GeminiClient } from "../clients/gemini";
import { rank } from "./candidates";
import { CURATOR_NULL_MAX_RANK, MIN_CURATOR_PICKS } from "./rules";
import { allowedTypes, defaultType, fallbackPicks, focusFor, plan } from "./plan";
import type { Slot } from "./slots";
import type { Candidate, Focus, PlannedItem } from "./types";

// Sent to Gemini as a JSON schema, so no .transform() here (z.toJSONSchema throws on it).
export const CuratorSchema = z.object({
  picks: z.array(
    z.object({
      slot: z.number().int(),
      candidateId: z.string().nullable(),
      type: z.enum(["story", "food", "town-welcome", "episode", "long-form"]),
      focus: z.enum([...INTEREST_IDS, "general"]),
    }),
  ),
});
export type CuratorAnswer = z.infer<typeof CuratorSchema>;

interface Entry {
  slot: Slot;
  candidate: Candidate;
}

// Short ids the curator answers with: "s3c1" = slot 3 candidate 1, "s3t0" = slot 3 town 0.
export function idMap(slots: readonly Slot[]): Map<string, Entry> {
  const m = new Map<string, Entry>();
  for (const slot of slots) {
    slot.candidates.forEach((candidate, i) => m.set(`s${slot.index}c${i}`, { slot, candidate }));
    slot.towns.forEach((candidate, i) => m.set(`s${slot.index}t${i}`, { slot, candidate }));
  }
  return m;
}

export interface Checked {
  items: PlannedItem[];
  itemSlots: number[]; // slot of each item, same order
  // Hard violations the model should fix on a retry (unknown ids, wrong type for the place, a focus the user doesn't have).
  problems: string[];
}

// Code checks every curator answer (design decision D3): each pick belongs to its slot's shortlist, the type fits
// the place (town-welcome -> town, long-form -> town or region, episode -> cluster) and the focus is one of the
// user's interests or "general". Repeats (same place twice, two picks of one kind in a slot) are dropped silently.
export function checkCuratorAnswer(answer: CuratorAnswer, slots: readonly Slot[], interests: readonly InterestId[], totalM: number): Checked {
  const ids = idMap(slots);
  const problems: string[] = [];
  const items: PlannedItem[] = [];
  const itemSlots: number[] = [];
  const seen = new Set<string>();
  const taken = new Set<string>(); // "slot:town" / "slot:other"
  for (const pick of answer.picks) {
    if (pick.candidateId === null) continue;
    const entry = ids.get(pick.candidateId);
    if (!entry) {
      problems.push(`candidateId "${pick.candidateId}" is not in the shortlists. Use only the ids given.`);
      continue;
    }
    if (entry.slot.index !== pick.slot) {
      problems.push(`candidateId "${pick.candidateId}" belongs to slot ${entry.slot.index}, not slot ${pick.slot}.`);
      continue;
    }
    if (!allowedTypes(entry.candidate).includes(pick.type)) {
      problems.push(`"${pick.candidateId}" (${entry.candidate.name}) cannot be type "${pick.type}"; use ${allowedTypes(entry.candidate).map((t) => `"${t}"`).join(" or ")}.`);
      continue;
    }
    if (pick.focus !== "general" && !interests.includes(pick.focus)) {
      problems.push(`focus "${pick.focus}" is not one of the listener's interests (${interests.join(", ")}) or "general".`);
      continue;
    }
    const slotKind = `${pick.slot}:${pick.type === "town-welcome" ? "town" : "other"}`;
    if (seen.has(pick.candidateId) || taken.has(slotKind)) continue;
    seen.add(pick.candidateId);
    taken.add(slotKind);
    items.push(plan(pick.type, entry.candidate, pick.focus as Focus, entry.slot, totalM));
    itemSlots.push(pick.slot);
  }
  return { items, itemSlots, problems };
}

const SYSTEM = `You are the curator of an audio road trip. The route is cut into equal stretches ("slots"). For every slot you get a
short list of places the car passes. Choose at most one place per slot to tell a story about, plus optionally one town
to welcome travellers to (towns have ids starting with t, places with c). The trip should have something to listen to
every ten minutes or so, so use null only when every place in a slot is a poor fit, and never leave a slot empty just
because a place is outside the listener's interests. Pick for the listener: lean towards their interests, prefer places
they have not heard (heard=true means they already did), and vary the kinds of places so the trip stays interesting.
Use only the ids you are given. Types: story (a single place), food (a food place), episode (a cluster of places, longer), town-welcome
(a town), long-form (a longer story about a town or a region). Answer with JSON only.`;

function prompt(slots: readonly Slot[], interests: readonly InterestId[], durationS: number): string {
  const line = (id: string, c: Candidate) =>
    `  ${id}: ${c.name} | ${c.kind}${c.kind === "episode" ? ` of ${c.members?.length ?? 0} places` : ""}` +
    ` | ${c.side} side | interests: ${c.interests.join(", ") || "-"}${c.heard ? " | heard=true" : ""}`;
  const body = slots
    .map((s) => {
      const rows = [
        ...s.candidates.map((c, i) => line(`s${s.index}c${i}`, c)),
        ...s.towns.map((c, i) => line(`s${s.index}t${i}`, c)),
      ];
      return `slot ${s.index} (${Math.round(s.fromM / 1000)} to ${Math.round(s.toM / 1000)} kilometres into the trip):\n${rows.join("\n") || "  (nothing)"}`;
    })
    .join("\n");
  return `The trip takes ${Math.round(durationS / 60)} minutes. Listener interests: ${interests.join(", ")}.\n` +
    `For each slot answer {slot, candidateId, type, focus}; candidateId null if no place suits. focus is one of the ` +
    `listener's interests or "general". Include a separate pick for a town when you want a town-welcome.\n\n${body}`;
}

// What the curator left empty. A slot without a valid pick (skipped, or only invalid answers) gets its top shortlist
// entry. An explicit null is honoured only when the slot's best place is weak and the slot or a neighbour has an item
// anyway (CURATOR_NULL_MAX_RANK); otherwise the top entry is used with focus "general" (the model judged it off-interest).
// A slot with only towns that ends up empty between two empty neighbours gets a town-welcome.
export function fillSlots(checked: Checked, answer: CuratorAnswer, slots: readonly Slot[], interests: readonly InterestId[], totalM: number): PlannedItem[] {
  const items = [...checked.items];
  const covered = new Set(checked.itemSlots); // slots with any item, town-welcomes included
  const picked = new Set(checked.itemSlots.filter((_, k) => checked.items[k].type !== "town-welcome"));
  const nulled = new Set(answer.picks.filter((p) => p.candidateId === null && p.type !== "town-welcome").map((p) => p.slot));
  const add = (item: PlannedItem, slot: Slot) => {
    items.push(item);
    covered.add(slot.index);
  };

  for (const slot of slots) {
    const top = slot.candidates[0];
    if (!top || picked.has(slot.index)) continue;
    if (!nulled.has(slot.index)) add(plan(defaultType(top), top, focusFor(top, interests), slot, totalM), slot);
    else if (rank(top) >= CURATOR_NULL_MAX_RANK) add(plan(defaultType(top), top, "general", slot, totalM), slot);
  }
  // Weak nulls and town-only slots, in route order: fill only where the slot and both neighbours would stay empty.
  for (const slot of slots) {
    const i = slot.index;
    if (covered.has(i) || covered.has(i - 1) || covered.has(i + 1)) continue;
    const top = slot.candidates[0];
    if (top) add(plan(defaultType(top), top, "general", slot, totalM), slot);
    else if (slot.towns[0]) add(plan("town-welcome", slot.towns[0], "general", slot, totalM), slot);
  }
  return items;
}

export interface Curated {
  items: PlannedItem[];
  source: "gemini" | "fallback";
  model?: string;
  note?: string;
}

// One Gemini call chooses from the shortlists; code checks the answer. Any failure, or fewer than 3 valid picks,
// falls back to the top shortlist entry of every slot, so a trip is always built (trip spec 5.4.6).
export async function curate(
  gemini: GeminiClient,
  input: { slots: readonly Slot[]; interests: readonly InterestId[]; durationS: number; totalM: number },
): Promise<Curated> {
  const { slots, interests, durationS, totalM } = input;
  const fallback = () => fallbackPicks(slots, interests, totalM);
  if (!slots.some((s) => s.candidates.length > 0 || s.towns.length > 0)) return { items: [], source: "fallback", note: "no candidates" };
  try {
    const res = await gemini.generateJson({
      purpose: "curate",
      system: SYSTEM,
      prompt: prompt(slots, interests, durationS),
      schema: CuratorSchema,
      validate: (answer) => checkCuratorAnswer(answer, slots, interests, totalM).problems,
    });
    const checked = checkCuratorAnswer(res.value, slots, interests, totalM);
    const items = fillSlots(checked, res.value, slots, interests, totalM);
    const backup = fallback();
    if (items.length >= Math.min(MIN_CURATOR_PICKS, backup.length)) return { items, source: "gemini", model: res.model };
    return { items: backup, source: "fallback", note: `curator returned ${items.length} valid picks` };
  } catch (e) {
    return { items: fallback(), source: "fallback", note: e instanceof Error ? e.message : String(e) };
  }
}
