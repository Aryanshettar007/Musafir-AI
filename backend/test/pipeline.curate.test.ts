import { describe, expect, it } from "vitest";
import { UpstreamError } from "../src/clients/upstream";
import { indexRoute, type LatLng } from "../src/geo";
import { curate } from "../src/pipeline/curate";
import { buildSlots } from "../src/pipeline/slots";
import type { Candidate } from "../src/pipeline/types";
import { fakeGemini } from "./helpers/fakes";

const route = indexRoute(Array.from({ length: 101 }, (_, i): LatLng => ({ lat: 12, lng: 77 + i * 0.00917 })));
let n = 0;
const cand = (km: number, over: Partial<Candidate> = {}): Candidate => ({
  key: `k${++n}`, kind: "poi", name: `Place at ${km}`, location: { lat: 12, lng: 77 + km * 0.00917 }, types: [], ratings: 1000, interests: [],
  distanceFromRouteM: 0, routeDistanceM: km * 1000, side: "left", historic: false, inEdge: false, score: 3, heard: false, ...over,
});

// 10 slots of 10 km; a place in slots 1, 3, 5, 7 and 8 and a town in slot 3.
const slots = buildSlots(
  { strict: [cand(15), cand(35), cand(55), cand(75), cand(85)], relaxed: [], local: [], towns: [cand(37, { kind: "town", name: "Townville" })], regions: [] },
  route, 3600,
);
const input = { slots, interests: ["history", "food"] as const, durationS: 3600, totalM: route.totalM };

describe("curate", () => {
  it("sends the shortlists and the user's interests, and turns valid picks into items", async () => {
    const gemini = fakeGemini([{ picks: [{ slot: 1, candidateId: "s1c0", type: "story", focus: "history" }, { slot: 3, candidateId: "s3c0", type: "story", focus: "general" }, { slot: 3, candidateId: "s3t0", type: "town-welcome", focus: "general" }, { slot: 5, candidateId: null, type: "story", focus: "general" }] }]);
    const out = await curate(gemini, input);
    expect(out.source).toBe("gemini");
    // Slots 7 and 8 were not mentioned, so they get their top entry; slot 5 was explicitly null, but its place is
    // strong (rank 3), so it is used anyway with focus "general".
    expect(out.items.map((i) => [i.type, i.candidate?.name])).toEqual([["story", "Place at 15"], ["story", "Place at 35"], ["town-welcome", "Townville"], ["story", "Place at 55"], ["story", "Place at 75"], ["story", "Place at 85"]]);
    expect(out.items.find((i) => i.candidate?.name === "Place at 55")?.focus).toBe("general");
    expect(gemini.calls[0].purpose).toBe("curate");
    expect(gemini.calls[0].prompt).toContain("Listener interests: history, food");
    expect(gemini.calls[0].prompt).toContain("s3c0: Place at 35");
    expect(gemini.calls[0].prompt).toContain("1000 reviews");
    expect(gemini.calls[0].system).toMatch(/most famous/);
    expect(gemini.calls[0].prompt).toContain("s3t0: Townville | town");
    expect(gemini.calls[0].prompt).toContain("slot 4");
  });

  it("gives a slot the model skipped its top entry", async () => {
    const gemini = fakeGemini([{ picks: [{ slot: 1, candidateId: "s1c0", type: "story", focus: "general" }] }]);
    const out = await curate(gemini, input);
    expect(out.source).toBe("gemini");
    expect(out.items.map((i) => i.candidate?.name).sort()).toEqual(["Place at 15", "Place at 35", "Place at 55", "Place at 75", "Place at 85"]);
  });

  describe("explicit nulls", () => {
    // One place per 10 km slot, slots 0-9; `weak` lists the slots whose place ranks below CURATOR_NULL_MAX_RANK.
    const every = (weak: number[], towns: Candidate[] = []) =>
      buildSlots({ strict: Array.from({ length: 10 }, (_, s) => cand(s * 10 + 5, { score: weak.includes(s) ? 2 : 4 })), relaxed: [], local: [], towns, regions: [] }, route, 3600);
    const picks = (slotsPicked: number[], nulls: number[]) => ({
      picks: [
        ...slotsPicked.map((s) => ({ slot: s, candidateId: `s${s}c0`, type: "story", focus: "general" })),
        ...nulls.map((s) => ({ slot: s, candidateId: null, type: "story", focus: "general" })),
      ],
    });
    const run = async (sl: ReturnType<typeof every>, answer: ReturnType<typeof picks>) =>
      (await curate(fakeGemini([answer]), { ...input, slots: sl })).items.map((i) => Math.floor(i.anchorRouteDistanceM / 10_000)).sort((a, b) => a - b);

    it("overrides a null on a strong place", async () => {
      expect(await run(every([]), picks([0, 1, 2, 4, 5, 6, 7, 8, 9], [3]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("fills a null on a weak place too: every slot with a place gets audio", async () => {
      expect(await run(every([3]), picks([0, 1, 2, 4, 5, 6, 7, 8, 9], [3]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(await run(every([3, 4, 5, 6, 7]), picks([0, 1, 2, 8, 9], [3, 4, 5, 6, 7]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("counts a town-welcome as the slot's audio", async () => {
      const sl = every([3, 4, 5], [cand(45, { kind: "town", name: "Townville" })]);
      const answer = { picks: [...picks([0, 1, 2, 6, 7, 8, 9], [3, 4, 5]).picks, { slot: 4, candidateId: "s4t0", type: "town-welcome", focus: "general" }] };
      const items = (await curate(fakeGemini([answer]), { ...input, slots: sl })).items;
      expect(items.filter((i) => Math.floor(i.anchorRouteDistanceM / 10_000) === 4).map((i) => i.type)).toEqual(["town-welcome"]);
      expect(await run(sl, answer)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  it("retries with the problems when the answer breaks the rules (validate), then accepts", async () => {
    const gemini = fakeGemini([{ picks: [{ slot: 1, candidateId: "s9c9", type: "story", focus: "general" }] }]);
    // The fake applies `validate` like the real client: an unknown id is an error the client would retry.
    const out = await curate(gemini, input);
    expect(out.source).toBe("fallback");
    expect(out.note).toMatch(/not in the shortlists/);
    expect(out.items.map((i) => i.candidate?.name)).toEqual(expect.arrayContaining(["Place at 15", "Place at 35", "Place at 55"]));
  });

  it("falls back to the top shortlist entry of every slot when Gemini fails", async () => {
    const out = await curate(fakeGemini([new UpstreamError("gemini", 503, "high demand", false)]), input);
    expect(out.source).toBe("fallback");
    expect(out.items.map((i) => i.candidate?.name).sort()).toEqual(["Place at 15", "Place at 35", "Place at 55", "Place at 75", "Place at 85"]);
  });

  it("does not call Gemini when nothing was found", async () => {
    const empty = buildSlots({ strict: [], relaxed: [], local: [], towns: [], regions: [] }, route, 3600);
    const gemini = fakeGemini([]);
    expect(await curate(gemini, { ...input, slots: empty })).toMatchObject({ items: [], source: "fallback" });
    expect(gemini.calls).toHaveLength(0);
  });
});
