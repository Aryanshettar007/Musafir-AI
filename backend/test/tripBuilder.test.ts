import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../src/clients/upstream";
import { Listen } from "../src/models/listen.model";
import { Place } from "../src/models/place.model";
import { Story } from "../src/models/story.model";
import { Trip } from "../src/models/trip.model";
import { PROMPT_VERSION } from "../src/pipeline/rules";
import { createTripBuilder, type BuildEvent, type TripBuilder } from "../src/services/trip";
import type { SponsorProvider, SponsoredItemSpec } from "../src/services/sponsor/types";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";
import { fakeGemini, fakeGnani, fakeMaps, memoryStorage } from "./helpers/fakes";
import { at, fakeWikipedia, gplace, newTrip, pipelineGemini, PLACES, story } from "./tripBuilder.helpers";

beforeAll(async () => {
  await startMongo();
  await Place.init();
  await Story.init();
});
afterAll(stopMongo);
beforeEach(clearCollections);
const builders: TripBuilder[] = [];
afterEach(() => builders.splice(0).forEach((b) => b.stop()));

function setup(over: { gemini?: ReturnType<typeof pipelineGemini>; wiki?: ReturnType<typeof fakeWikipedia>; sponsor?: SponsorProvider; maps?: ReturnType<typeof fakeMaps> } = {}) {
  const events: BuildEvent[] = [];
  const gemini = fakeGemini(over.gemini ?? pipelineGemini());
  const gnani = fakeGnani();
  const storage = memoryStorage();
  const wikipedia = over.wiki ?? fakeWikipedia();
  const maps = over.maps ?? fakeMaps({ searchNearby: async () => PLACES, searchText: async () => ({ places: [] }) });
  const builder = createTripBuilder({ maps, wikipedia, gemini, gnani, storage, sponsor: over.sponsor, onEvent: (e) => events.push(e) });
  builders.push(builder);
  return { builder, gemini, gnani, storage, wikipedia, events };
}

const load = async (id: Types.ObjectId) => (await Trip.findById(id).lean())!;

describe("trip builder", () => {
  it("builds a trip end to end: route order, progress, stories, audio and triggers", async () => {
    const { builder, gnani, storage, gemini } = setup();
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));

    const t = await load(trip._id);
    expect(t.status).toBe("ready");
    expect(t.stage).toBe("done");
    expect(t.builtAt).toBeInstanceOf(Date);
    expect(t.items.length).toBeGreaterThanOrEqual(4);
    expect(t.items.every((i) => i.status === "ready")).toBe(true);
    expect(t.items[0].type).toBe("trip-intro");
    const anchors = t.items.map((i) => i.anchorRouteDistanceM);
    expect([...anchors].sort((a, b) => a - b)).toEqual(anchors);

    for (const item of t.items) {
      expect(item.trigger, item.title ?? item.type).toBeDefined();
      expect(item.trigger!.routeDistanceM).toBeLessThanOrEqual(item.anchorRouteDistanceM);
      expect(item.storyId).toBeDefined();
    }
    expect(t.items[0].trigger!.radiusM).toBe(1000);
    expect(t.items[1].trigger!.radiusM).toBe(400);

    // Stories exist, audio was uploaded to a per-language key and nothing narrated at interactive priority.
    const stories = await Story.find().lean();
    expect(stories.length).toBe(t.items.length);
    expect(storage.puts.every((p) => /^stories\/en-IN\/[a-f0-9]{24}\.mp3$/.test(p.key) && p.contentType === "audio/mpeg")).toBe(true);
    expect(gnani.calls.length).toBeGreaterThanOrEqual(t.items.length);
    expect(gnani.calls.every((c) => c.priority === "background" && c.voice === "Deepak" && c.language === "en-IN")).toBe(true);
    expect(stories.every((s) => s.audio.durationS > 0 && s.promptVersion === PROMPT_VERSION && s.models.tts === "timbre-v2.5")).toBe(true);
    expect(gemini.calls.filter((c) => c.purpose === "curate")).toHaveLength(1);
    expect(gemini.calls.filter((c) => c.purpose === "story")).toHaveLength(t.items.length);
  });

  it("writes only from retrieved facts: a place without an article borrows the nearest town's facts", async () => {
    const { builder, wikipedia, gemini } = setup();
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);

    const temple = await Place.findOne({ googlePlaceId: "g-temple" }).lean();
    expect(temple).toBeTruthy();
    const templeItem = t.items.find((i) => i.placeIds.some((p) => p.equals(temple!._id)))!;
    expect(templeItem.type).toBe("story");
    // The temple has no article, so the town (Townville, page 102) is the second place of the item.
    const town = await Place.findOne({ "wikipedia.pageId": 102 }).lean();
    expect(templeItem.placeIds.map(String)).toEqual([String(temple!._id), String(town!._id)]);
    expect(wikipedia.extractCalls).toContain(102);
    const prompt = gemini.calls.filter((c) => c.purpose === "story").map((c) => c.prompt).find((p) => p.includes("PLACES: Beta Temple"))!;
    expect(prompt).toContain("has no article of its own");
    expect(prompt).toContain("Plain text facts about page 102");
    // Facts are saved on the place with the page url (attribution).
    const fort = await Place.findOne({ googlePlaceId: "g-fort" }).lean();
    expect(fort?.facts?.url).toBe("https://en.wikipedia.org/wiki/Page_101");
    expect(fort?.google?.fetchedAt).toBeInstanceOf(Date);
  });

  it("writes a famous place without an article from Gemini's knowledge instead of dropping it", async () => {
    const places = [
      gplace("g-fort", "Alpha Fort", 20, { primaryType: "historical_landmark", types: ["historical_landmark"] }),
      gplace("g-temple", "Beta Temple", 32, { primaryType: "hindu_temple", types: ["hindu_temple"], userRatingCount: 100_000 }),
    ];
    const wiki = fakeWikipedia({ hits: [{ pageId: 101, title: "Alpha Fort", location: at(20, 300), description: "Fort in Karnataka, India", length: 20000 }] });
    const { builder, gemini } = setup({ wiki, maps: fakeMaps({ searchNearby: async () => places, searchText: async () => ({ places: [] }) }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(t.items.find((i) => i.title === "Beta Temple")?.status).toBe("ready");
    const prompt = gemini.calls.filter((c) => c.purpose === "story").map((c) => c.prompt).find((p) => p.includes("PLACES: Beta Temple"))!;
    expect(prompt).toContain("KNOWN PLACE: Beta Temple (from Google: Hindu temple; hugely popular, with tens of thousands of reviews)");
    expect(prompt).not.toContain("FACTS about Beta Temple");
  });

  it("removes an item that has neither an article nor a town nearby", async () => {
    const { builder, events } = setup({ wiki: fakeWikipedia({ hits: [{ pageId: 101, title: "Alpha Fort", location: at(20, 300), description: "Fort in Karnataka, India", length: 20000 }] }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(events.some((e) => e.kind === "warn" && /dropped "Beta Temple"/.test(e.message))).toBe(true);
    expect(t.items.map((i) => i.title)).not.toContain("Beta Temple");
    expect(t.status).toBe("ready");
  });

  it("replaces an item dropped for lack of facts with a same-slot alternative that has them", async () => {
    // Slot 3 (30-40 km): Beta Temple ranks first but has no article, no town nearby and too few reviews to be written
    // from Gemini's knowledge; Delta Museum has an article.
    const places = [
      gplace("g-fort", "Alpha Fort", 20, { primaryType: "historical_landmark", types: ["historical_landmark"] }),
      gplace("g-temple", "Beta Temple", 32, { primaryType: "hindu_temple", types: ["hindu_temple"], userRatingCount: 9_000 }),
      gplace("g-museum", "Delta Museum", 36, { primaryType: "museum", types: ["museum"], userRatingCount: 1 }),
    ];
    const wiki = fakeWikipedia({
      hits: [
        { pageId: 101, title: "Alpha Fort", location: at(20, 300), description: "Fort in Karnataka, India", length: 20000 },
        { pageId: 105, title: "Delta Museum", location: at(36, 300), description: "Museum in Karnataka", length: 8000 },
      ],
    });
    const { builder, events } = setup({ wiki, maps: fakeMaps({ searchNearby: async () => places, searchText: async () => ({ places: [] }) }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    const titles = t.items.map((i) => i.title);
    expect(titles).not.toContain("Beta Temple");
    expect(titles).toContain("Delta Museum");
    expect(events.some((e) => e.kind === "warn" && /replaced "Beta Temple".*"Delta Museum"/.test(e.message))).toBe(true);
    const anchors = t.items.map((i) => i.anchorRouteDistanceM);
    expect([...anchors].sort((a, b) => a - b)).toEqual(anchors);
    expect(t.status).toBe("ready");
  });

  it("reuses cached stories on a second trip with the same places, language and voice", async () => {
    const { builder, gemini, gnani } = setup();
    const first = await newTrip("u1");
    await builder.start(String(first._id));
    const storyCalls = gemini.calls.filter((c) => c.purpose === "story").length;
    const ttsCalls = gnani.calls.length;

    const second = await newTrip("u2");
    await builder.start(String(second._id));
    const t = await load(second._id);
    expect(t.status).toBe("ready");
    // Only the per-trip intro is written and narrated again.
    expect(gemini.calls.filter((c) => c.purpose === "story").length).toBe(storyCalls + 1);
    expect(gnani.calls.length).toBe(ttsCalls + 1);
    const ids = new Set((await load(first._id)).items.map((i) => String(i.storyId)));
    const shared = t.items.filter((i) => ids.has(String(i.storyId)));
    expect(shared.length).toBe(t.items.length - 1);
  });

  it("does not share stories across voices", async () => {
    const { builder, gemini } = setup();
    await builder.start(String((await newTrip("u1"))._id));
    const before = gemini.calls.filter((c) => c.purpose === "story").length;
    await builder.start(String((await newTrip("u2", { prefs: { language: "en-IN", voice: "Nalini", voiceGender: "female", interests: ["history"], musicMode: "rj" } }))._id));
    expect(gemini.calls.filter((c) => c.purpose === "story").length).toBeGreaterThan(before + 1);
  });

  it("marks one item failed and finishes the trip with the rest", async () => {
    const { builder, events } = setup({
      gemini: pipelineGemini({ story: (req) => (req.prompt.includes("PLACES: Beta Temple") ? new UpstreamError("gemini", 500, "model down", false) : story(req.prompt)) }),
    });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(t.status).toBe("ready");
    const failed = t.items.filter((i) => i.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/model down/);
    expect(failed[0].trigger).toBeUndefined();
    expect(t.items.filter((i) => i.status === "ready").length).toBe(t.items.length - 1);
    expect(events.some((e) => e.kind === "item" && e.status === "failed")).toBe(true);
  });

  it("falls back to the top shortlist entries when the curator fails", async () => {
    const { builder, events } = setup({ gemini: pipelineGemini({ curate: () => new UpstreamError("gemini", 503, "high demand", false) }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(t.status).toBe("ready");
    expect(t.items.length).toBeGreaterThanOrEqual(4);
    const sel = events.find((e) => e.kind === "selection");
    expect(sel && sel.kind === "selection" && sel.selection.source).toBe("fallback");
  });

  it("fails with NOTHING_BUILT when every item fails", async () => {
    const { builder } = setup({ gemini: pipelineGemini({ story: () => new UpstreamError("gemini", 500, "down", false) }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(t.status).toBe("failed");
    expect(t.failure?.code).toBe("NOTHING_BUILT");
    expect(t.items.every((i) => i.status === "failed")).toBe(true);
  });

  it("fails with DISCOVERY_FAILED when Places is down", async () => {
    const down = async () => {
      throw new UpstreamError("maps", 503, "down", true);
    };
    const { builder } = setup({ maps: fakeMaps({ searchNearby: down, searchText: down }) });
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const t = await load(trip._id);
    expect(t.status).toBe("failed");
    expect(t.failure?.code).toBe("DISCOVERY_FAILED");
  });

  it("resumes from the producing stage without redoing finished items", async () => {
    // First build, then simulate a restart that lost the second half: reset two items to pending.
    const { builder, gnani, gemini } = setup();
    const trip = await newTrip("u1");
    await builder.start(String(trip._id));
    const built = await load(trip._id);
    const redo = built.items.slice(-2).map((i) => i._id);
    await Trip.updateOne(
      { _id: trip._id },
      { $set: { status: "building", stage: "producing", builtAt: null, "items.$[a].status": "pending", "items.$[b].status": "pending" }, $unset: { "items.$[a].trigger": "", "items.$[b].trigger": "" } },
      { arrayFilters: [{ "a._id": redo[0] }, { "b._id": redo[1] }] },
    );
    const callsBefore = { tts: gnani.calls.length, story: gemini.calls.filter((c) => c.purpose === "story").length, curate: gemini.calls.filter((c) => c.purpose === "curate").length };

    const fresh = setup(); // a new process: new builder, same database
    expect(await fresh.builder.resumeAll()).toBe(1);
    await fresh.builder.start(String(trip._id)); // joins the build resumeAll started
    const t = await load(trip._id);
    expect(t.status).toBe("ready");
    expect(t.items.every((i) => i.status === "ready" && i.trigger)).toBe(true);
    // Resumed items found their stories in the cache: nothing written or narrated, no curator, no discovery.
    expect(fresh.gemini.calls).toHaveLength(0);
    expect(fresh.gnani.calls).toHaveLength(0);
    expect(callsBefore.curate).toBe(1);
  });

  it("builds a trip once when two processes resume it at the same time", async () => {
    const trip = await newTrip("u1");
    const a = setup(), b = setup();
    expect(await Promise.all([a.builder.resumeAll(), b.builder.resumeAll()])).toEqual([1, 1]);
    await Promise.all([a.builder.start(String(trip._id)), b.builder.start(String(trip._id))]);
    await vi.waitFor(async () => expect((await load(trip._id)).status).toBe("ready"), { timeout: 5000 });
    const t = await load(trip._id);
    const calls = [...a.gemini.calls, ...b.gemini.calls];
    expect(calls.filter((c) => c.purpose === "curate")).toHaveLength(1);
    expect(calls.filter((c) => c.purpose === "story")).toHaveLength(t.items.length);
    expect(a.gnani.calls.length * b.gnani.calls.length).toBe(0); // only one process narrated
    expect(t.lease).toBeFalsy(); // released when the build ended
  });

  it("leaves a trip to the process holding its lease, and takes over when that lease runs out", async () => {
    const trip = await newTrip("u1", { lease: { owner: "other-process", expiresAt: new Date(Date.now() + 400) } });
    const { builder, gemini } = setup();
    await builder.resumeAll();
    await builder.start(String(trip._id));
    expect(gemini.calls).toHaveLength(0);
    expect((await load(trip._id)).status).toBe("building");
    // The other process never renewed (it died): this one claims the trip after expiry and builds it.
    await vi.waitFor(async () => expect((await load(trip._id)).status).toBe("ready"), { timeout: 5000, interval: 100 });
    expect(gemini.calls.filter((c) => c.purpose === "curate")).toHaveLength(1);
  });

  it("claims a trip whose lease has already expired straight away", async () => {
    const trip = await newTrip("u1", { lease: { owner: "dead-process", expiresAt: new Date(Date.now() - 1000) } });
    const { builder } = setup();
    await builder.start(String(trip._id));
    expect((await load(trip._id)).status).toBe("ready");
  });

  it("re-plans from scratch when resumed in the curating stage (items replaced, not appended)", async () => {
    const { builder } = setup();
    const first = await newTrip("u1");
    await builder.start(String(first._id));
    const count = (await load(first._id)).items.length;
    // As if a restart found the trip still at the curating stage with items from an earlier attempt.
    await Trip.updateOne({ _id: first._id }, { $set: { status: "building", stage: "curating" } });
    await setup().builder.start(String(first._id));
    const t = await load(first._id);
    expect(t.items.length).toBe(count);
    expect(t.status).toBe("ready");
  });

  it("restarts discovery for a trip left in the discovering stage", async () => {
    const { builder } = setup();
    const trip = await newTrip("u1", { stage: "curating" });
    await builder.resumeAll();
    await builder.start(String(trip._id));
    expect((await load(trip._id)).status).toBe("ready");
  });

  it("runs only trips that are still building", async () => {
    const { builder, gemini } = setup();
    const trip = await newTrip("u1", { status: "ready", stage: "done" });
    await builder.start(String(trip._id));
    expect(gemini.calls).toHaveLength(0);
  });

  it("flags places the user already heard", async () => {
    const { builder, events } = setup();
    const first = await newTrip("u1");
    await builder.start(String(first._id));
    const t = await load(first._id);
    const fortItem = t.items.find((i) => i.placeIds.length === 1 && i.type === "story")!;
    await Listen.create({ userId: "u1", clientEventId: "e1", tripId: first._id, itemId: fortItem._id, placeIds: fortItem.placeIds, event: "completed", at: new Date() });
    events.length = 0;
    const second = await newTrip("u1");
    await builder.start(String(second._id));
    const sel = events.find((e) => e.kind === "selection");
    const heard = sel && sel.kind === "selection" ? sel.selection.slots.flatMap((s) => s.candidates).filter((c) => c.heard) : [];
    expect(heard.length).toBeGreaterThan(0);
  });

  describe("sponsored item", () => {
    const spec = (km: number): SponsoredItemSpec => ({
      sponsorSlug: "corner-house", sponsorName: "Corner House", outletLabel: "Corner House, Test", anchorRouteDistanceM: km * 1000, side: "left",
      title: "Corner House ad", audio: { storageKey: "sponsors/corner-house/kn-IN/ad.mp3", bytes: 45_000, durationS: 20 }, transcript: "Ad text", triggerRadiusM: 500,
    });

    it("inserts at most one ready sponsored item and keeps spacing around it", async () => {
      const calls: unknown[] = [];
      const sponsor: SponsorProvider = { sponsoredItemFor: async (input) => (calls.push(input), spec(32)) };
      const { builder, gemini } = setup({ sponsor });
      const trip = await newTrip("u1");
      await builder.start(String(trip._id));
      const t = await load(trip._id);
      const sponsored = t.items.filter((i) => i.type === "sponsored");
      expect(sponsored).toHaveLength(1);
      expect(sponsored[0]).toMatchObject({ status: "ready", sponsor: { slug: "corner-house", name: "Corner House" }, transcript: "Ad text", side: "left" });
      expect(sponsored[0].audio?.storageKey).toBe("sponsors/corner-house/kn-IN/ad.mp3");
      expect(sponsored[0].trigger?.radiusM).toBe(500);
      expect(sponsored[0].trigger!.routeDistanceM).toBeLessThan(32_000);
      expect(sponsored[0].storyId).toBeUndefined();
      expect(calls[0]).toMatchObject({ language: "en-IN", voice: "Deepak" });
      // The ad is not announced as a place in the trip intro.
      const intro = gemini.calls.find((c) => c.purpose === "story" && c.prompt.includes("FACTS (the trip)"))!;
      expect(intro.prompt).not.toContain("Corner House ad");
      expect((calls[0] as { avgSpeedMps: number }).avgSpeedMps).toBeCloseTo(60_000 / 3600, 5);
      // Neighbours keep (target + 60 s) of driving to the ad.
      const v = 60_000 / 3600;
      const i = t.items.findIndex((x) => x.type === "sponsored");
      if (t.items[i - 1]) expect(32_000 - t.items[i - 1].anchorRouteDistanceM).toBeGreaterThanOrEqual((t.items[i - 1].targetSeconds + 60) * v - 1);
      if (t.items[i + 1]) expect(t.items[i + 1].anchorRouteDistanceM - 32_000).toBeGreaterThanOrEqual((20 + 60) * v - 1);
    });

    it("fails with NOTHING_BUILT when only the ad and the intro are ready", async () => {
      const { builder } = setup({
        sponsor: { sponsoredItemFor: async () => spec(32) },
        gemini: pipelineGemini({ story: (req) => (req.prompt.includes("FACTS (the trip)") ? story(req.prompt) : new UpstreamError("gemini", 500, "down", false)) }),
      });
      const trip = await newTrip("u1");
      await builder.start(String(trip._id));
      const t = await load(trip._id);
      expect(t.items.filter((i) => i.status === "ready").map((i) => i.type).sort()).toEqual(["sponsored", "trip-intro"]);
      expect(t.status).toBe("failed");
      expect(t.failure?.code).toBe("NOTHING_BUILT");
    });

    it("carries on without an ad when the provider fails or finds nothing", async () => {
      const failing = setup({ sponsor: { sponsoredItemFor: async () => { throw new Error("db down"); } } });
      const a = await newTrip("u1");
      await failing.builder.start(String(a._id));
      expect((await load(a._id)).items.some((i) => i.type === "sponsored")).toBe(false);
      expect((await load(a._id)).status).toBe("ready");
      expect(failing.events.some((e) => e.kind === "warn" && /sponsor lookup failed/.test(e.message))).toBe(true);

      const none = setup({ sponsor: { sponsoredItemFor: async () => null } });
      const b = await newTrip("u2");
      await none.builder.start(String(b._id));
      expect((await load(b._id)).items.some((i) => i.type === "sponsored")).toBe(false);
    });
  });
});

afterAll(() => mongoose.disconnect());
