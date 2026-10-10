import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { indexRoute } from "../src/geo";
import { Sponsor } from "../src/models/sponsor.model";
import { adSchema, adWords, buildAdPrompt, checkAd } from "../src/services/sponsor/adPrompt";
import { corridorBoxes, inBoxes, matchOutlet } from "../src/services/sponsor/outletMatching";
import { createSponsorAds, SponsorAdError } from "../src/services/sponsor/sponsorAds";
import { createSponsorProvider } from "../src/services/sponsor/sponsorProvider";
import { CORNER_HOUSE } from "../src/sponsors/cornerHouse";
import { fakeGemini, fakeGnani, memoryStorage } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";

// A straight road heading east along lat 12.0, 0 to ~22 km. Left of travel = north.
const route = indexRoute(Array.from({ length: 21 }, (_, i) => ({ lat: 12, lng: 77 + i * 0.01 })));
const at = (km: number, northM: number) => ({ lat: 12 + northM / 111_195, lng: 77 + km / 111.195 });

describe("matchOutlet", () => {
  const outlet = (label: string, km: number, northM: number) => ({ label, location: at(km, northM) });
  it("matches an outlet near the route and reports side and anchor", () => {
    const m = matchOutlet(route, [outlet("north", 10, 1500)], { maxDetourM: 3000 });
    expect(m?.side).toBe("left");
    expect(m?.detourM).toBeCloseTo(1500, -1);
    expect(Math.abs((m?.anchorRouteDistanceM ?? 0) - 10_000 * Math.cos((12 * Math.PI) / 180))).toBeLessThan(50);
    expect(matchOutlet(route, [outlet("south", 10, -1500)], { maxDetourM: 3000 })?.side).toBe("right");
  });
  it("says none when the outlet is on the road", () => {
    expect(matchOutlet(route, [outlet("on", 10, 10)], { maxDetourM: 3000 })?.side).toBe("none");
  });
  it("ignores outlets farther than maxDetourM", () => {
    expect(matchOutlet(route, [outlet("far", 10, 3500)], { maxDetourM: 3000 })).toBeNull();
  });
  it("ignores outlets in the first 2 km", () => {
    expect(matchOutlet(route, [outlet("start", 1, 500)], { maxDetourM: 3000 })).toBeNull();
  });
  it("picks the smallest detour", () => {
    const m = matchOutlet(route, [outlet("a", 8, 2500), outlet("b", 12, 800)], { maxDetourM: 3000 });
    expect(m?.outlet.label).toBe("b");
  });
});

describe("corridorBoxes", () => {
  it("covers points near the route and excludes far ones", () => {
    const boxes = corridorBoxes(route, 3000);
    expect(boxes.length).toBe(1); // ~22 km route, one 25 km slice
    expect(inBoxes(at(10, 2900), boxes)).toBe(true);
    expect(inBoxes(at(10, -2900), boxes)).toBe(true);
    expect(inBoxes(at(10, 5000), boxes)).toBe(false);
  });
  it("hugs a long diagonal route with one box per slice", () => {
    const diagonal = indexRoute(Array.from({ length: 101 }, (_, i) => ({ lat: 12 + i * 0.01, lng: 77 + i * 0.01 })));
    const boxes = corridorBoxes(diagonal, 3000);
    expect(boxes.length).toBeGreaterThan(4);
    expect(inBoxes({ lat: 12.5, lng: 77.5 }, boxes)).toBe(true);
    // Inside the single bounding box of the whole route, but ~50 km off the road.
    expect(inBoxes({ lat: 12.9, lng: 77.1 }, boxes)).toBe(false);
  });
});

describe("buildAdPrompt", () => {
  const brief = { ...CORNER_HOUSE.brief, name: CORNER_HOUSE.name };
  it("asks for a sponsor cue, the brief only and a 15 to 25 s word window", () => {
    const p = buildAdPrompt({ brief, language: "en-IN" });
    expect(p.words).toEqual({ target: 63, min: 48, max: 79 });
    expect(p.prompt).toContain("sponsored message");
    expect(p.prompt).toContain("Death By Chocolate");
    expect(p.prompt).toContain("48 to 79 words");
    expect(p.prompt).toContain("Do not say which side");
    expect(p.prompt).toContain("do not mention distances");
    expect(p.prompt).not.toMatch(/our partner"/);
  });
  it("Kannada words come from 115 wpm: 15 s is 29 words, so a 12 s (23 word) ad is rejected", () => {
    expect(adWords("kn-IN")).toEqual({ target: 38, min: 29, max: 48 });
    const words = (n: number) => Array.from({ length: n }, () => "ಐಸ್‌ಕ್ರೀಮ್").join(" ");
    expect(checkAd({ title: "ಕಾರ್ನರ್ ಹೌಸ್", script: words(23) }, "kn-IN").join(" ")).toContain("between 29 and 48");
    expect(checkAd({ title: "ಕಾರ್ನರ್ ಹೌಸ್", script: words(38) }, "kn-IN")).toEqual([]);
  });
  it("checks the title's script too", () => {
    const words = Array.from({ length: 38 }, () => "ಐಸ್‌ಕ್ರೀಮ್").join(" ");
    expect(checkAd({ title: "ಕಾರ್ನర్ ಹೌಸ್ 1", script: words }, "kn-IN").some((p) => p.startsWith("Title:"))).toBe(true);
  });
  it("uses a schema without transforms", () => {
    expect(adSchema.safeParse({ title: "t", script: "s" }).success).toBe(true);
  });
});

// 63 words: inside the 48 to 79 word English window (15 to 25 s at 190 wpm).
const SCRIPT =
  "Here's a quick sponsored message from Corner House Ice Creams. Coming up on your way is a famous Bengaluru ice cream parlour, " +
  "started in nineteen eighty two. Their Death By Chocolate sundae is big, rich and made for chocolate lovers. " +
  "If you are in Mysuru, stop by for an ice cream, stretch your legs, and treat yourself. Enjoy the rest of the drive!";
const goodAd = { title: "Corner House Treat", script: SCRIPT };

describe("sponsor ads and provider", () => {
  beforeAll(startMongo);
  afterAll(stopMongo);
  beforeEach(async () => {
    await clearCollections();
    await Sponsor.create(CORNER_HOUSE);
  });

  it("ensureAd generates once, then serves the cache without Gemini or Gnani", async () => {
    const gemini = fakeGemini(() => goodAd);
    const gnani = fakeGnani();
    const storage = memoryStorage();
    const ads = createSponsorAds({ gemini, gnani, storage });
    const first = await ads.ensureAd("corner-house", "en-IN", "Deepak");
    expect(first.storageKey).toBe("ads/corner-house/en-IN/Deepak.mp3");
    expect(first.durationS).toBeGreaterThan(1);
    expect(storage.puts.map((p) => p.key)).toEqual(["ads/corner-house/en-IN/Deepak.mp3"]);
    expect(gnani.calls.every((c) => c.priority === "background")).toBe(true);
    const geminiCalls = gemini.calls.length, gnaniCalls = gnani.calls.length;
    const second = await ads.ensureAd("corner-house", "en-IN", "Deepak");
    expect(second.script).toBe(first.script);
    expect(gemini.calls.length).toBe(geminiCalls);
    expect(gnani.calls.length).toBe(gnaniCalls);
    expect((await Sponsor.findOne({ slug: "corner-house" }))?.ads).toHaveLength(1);
  });

  it("concurrent ensureAd calls generate once and store one ad", async () => {
    const gemini = fakeGemini(() => goodAd);
    const ads = createSponsorAds({ gemini, gnani: fakeGnani(), storage: memoryStorage() });
    await Promise.all([1, 2, 3].map(() => ads.ensureAd("corner-house", "en-IN", "Nalini")));
    expect(gemini.calls).toHaveLength(1);
    expect((await Sponsor.findOne({ slug: "corner-house" }))?.ads).toHaveLength(1);
  });

  it("two separate service instances (two processes) still store one ad", async () => {
    const mk = () => createSponsorAds({ gemini: fakeGemini(() => goodAd), gnani: fakeGnani(), storage: memoryStorage() });
    await Promise.all([mk(), mk()].map((a) => a.ensureAd("corner-house", "en-IN", "Deepak")));
    expect((await Sponsor.findOne({ slug: "corner-house" }))?.ads).toHaveLength(1);
  });

  const mysuruRoute = indexRoute(
    Array.from({ length: 31 }, (_, i) => ({ lat: 12.3228, lng: 76.55 + i * 0.01 })), // passes the V.V. Mohalla outlet
  );

  it("provider returns the sponsored item for a route passing an outlet", async () => {
    const ads = createSponsorAds({ gemini: fakeGemini(() => goodAd), gnani: fakeGnani(), storage: memoryStorage() });
    const provider = createSponsorProvider({ ads });
    const item = await provider.sponsoredItemFor({ route: mysuruRoute, language: "en-IN", voice: "Deepak", avgSpeedMps: 20 });
    expect(item?.sponsorSlug).toBe("corner-house");
    expect(item?.outletLabel).toContain("V.V. Mohalla");
    expect(item?.triggerRadiusM).toBe(600);
    expect(item?.transcript).toBe(SCRIPT);
    expect(item?.anchorRouteDistanceM).toBeGreaterThan(2000);
  });

  it("provider returns null when there are no sponsors, none active, or none near", async () => {
    const ads = createSponsorAds({ gemini: fakeGemini(() => goodAd), gnani: fakeGnani(), storage: memoryStorage() });
    const provider = createSponsorProvider({ ads });
    const input = { route: mysuruRoute, language: "en-IN" as const, voice: "Deepak", avgSpeedMps: 20 };
    expect(await provider.sponsoredItemFor({ ...input, route })).toBeNull(); // route far away
    await Sponsor.updateOne({ slug: "corner-house" }, { active: false });
    expect(await provider.sponsoredItemFor(input)).toBeNull();
    await Sponsor.deleteMany({});
    expect(await provider.sponsoredItemFor(input)).toBeNull();
  });

  it("ensureAd rejects an unknown voice before calling Gemini", async () => {
    const gemini = fakeGemini(() => goodAd);
    const ads = createSponsorAds({ gemini, gnani: fakeGnani(), storage: memoryStorage() });
    await expect(ads.ensureAd("corner-house", "en-IN", "Nobody")).rejects.toBeInstanceOf(SponsorAdError);
    await expect(ads.ensureAd("nope", "en-IN", "Deepak")).rejects.toMatchObject({ code: "UNKNOWN_SPONSOR" });
    expect(gemini.calls).toHaveLength(0);
  });

  it("ensureAd retries are driven by the ad check (too short is a problem)", async () => {
    const gemini = fakeGemini(() => ({ title: "Short", script: "Here's a quick sponsored message. Try Corner House." }));
    const ads = createSponsorAds({ gemini, gnani: fakeGnani(), storage: memoryStorage() });
    await expect(ads.ensureAd("corner-house", "en-IN", "Deepak")).rejects.toThrow(/between 48 and 79/);
    expect((await Sponsor.findOne({ slug: "corner-house" }))?.ads).toHaveLength(0);
  });

  it("provider picks the sponsor with the smallest detour and reports the outlet side", async () => {
    // 1 km north of the test route (left of travel); V.V. Mohalla is ~4 m from it, so Corner House wins first.
    await Sponsor.create({
      ...CORNER_HOUSE, slug: "other", name: "Other",
      outlets: [{ label: "Other outlet", location: { type: "Point", coordinates: [76.7, 12.3228 + 1000 / 111_195] } }],
    });
    const ads = createSponsorAds({ gemini: fakeGemini(() => goodAd), gnani: fakeGnani(), storage: memoryStorage() });
    const provider = createSponsorProvider({ ads });
    const input = { route: mysuruRoute, language: "en-IN" as const, voice: "Deepak", avgSpeedMps: 20 };
    const first = await provider.sponsoredItemFor(input);
    expect(first?.sponsorSlug).toBe("corner-house");
    expect(first?.side).toBe("none"); // on the road
    // Exactly the SponsoredItemSpec fields, nothing extra.
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["anchorRouteDistanceM", "audio", "outletLabel", "side", "sponsorName", "sponsorSlug", "title", "transcript", "triggerRadiusM"].sort(),
    );
    await Sponsor.updateOne({ slug: "corner-house" }, { active: false });
    const second = await provider.sponsoredItemFor(input);
    expect(second?.sponsorSlug).toBe("other");
    expect(second?.side).toBe("left");
    expect(second?.anchorRouteDistanceM).toBeGreaterThan(15_000);
  });

  it("provider returns null (not an error) when the ad cannot be generated", async () => {
    const ads = createSponsorAds({ gemini: fakeGemini(() => new Error("quota")), gnani: fakeGnani(), storage: memoryStorage() });
    const provider = createSponsorProvider({ ads });
    const item = await provider.sponsoredItemFor({ route: mysuruRoute, language: "en-IN", voice: "Deepak", avgSpeedMps: 20 });
    expect(item).toBeNull();
  });
});
