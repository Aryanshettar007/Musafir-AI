import { describe, expect, it } from "vitest";
import { buildPrompt, writeStory, type WriteRequest } from "../src/pipeline/write";
import { introFactsCheck } from "./pipeline.write.helpers";
import { fakeGemini } from "./helpers/fakes";

const base: WriteRequest = {
  type: "story", language: "kn-IN", focus: "history", side: "right", targetSeconds: 60, interests: ["history", "food"],
  places: [{ name: "Srirangapatna Fort", kind: "poi", facts: "The fort was built in the sixteenth century." }],
};

describe("story prompt", () => {
  it("states the word budget, the language guide, the side and the facts", () => {
    const p = buildPrompt(base);
    expect(p).toContain("about 115 words"); // 60 s x 115 wpm (Kannada, measured)
    expect(p).toContain("between 69 and 149 words");
    expect(p).toContain("LANGUAGE: Kannada (Kannada script). Natural spoken Kannada in Kannada script");
    expect(p).toContain('on the right side of the road; say so once, naturally ("on your right")');
    expect(p).toContain("lean this story towards history");
    expect(p).toContain("The fort was built in the sixteenth century.");
    expect(p).not.toContain("no article of its own");
  });

  it("sizes the word budget for the narrating voice", () => {
    const p = buildPrompt({ ...base, voice: "Girish" });
    expect(p).toContain("about 140 words"); // Girish speaks about 140 wpm in Kannada
    expect(p).toContain("between 84 and 182 words");
  });

  it("forbids sides for none and never asks for distances", () => {
    const p = buildPrompt({ ...base, side: "none", focus: "general" });
    expect(p).toContain("Do not say which side of the road anything is on.");
    expect(p).not.toContain("lean this story");
    expect(p).not.toMatch(/kilomet|km\b/i);
  });

  it("names places without an article as local stops and keeps the story on the area", () => {
    const p = buildPrompt({
      ...base, type: "food",
      places: [{ name: "Maddur Tiffanys", kind: "food" }, { name: "Maddur", kind: "town", facts: "Maddur is a town known for the Maddur vada." }],
    });
    expect(p).toContain("Maddur Tiffanys has no article of its own");
    expect(p).toContain("invent nothing about it");
    expect(p).toContain("Maddur is a town known for the Maddur vada.");
  });

  it("trims each member's facts for an episode", () => {
    const long = "x".repeat(9000);
    const p = buildPrompt({ ...base, type: "episode", places: [{ name: "A", kind: "poi", facts: long }, { name: "B", kind: "poi", facts: long }] });
    expect(p.length).toBeLessThan(2 * 2500 + 2000);
  });

  it("uses the trip itself as the facts of a trip-intro", () => {
    const p = buildPrompt({ ...base, type: "trip-intro", places: [], side: "none", focus: "general", tripFacts: introFactsCheck });
    expect(p).toContain("FACTS (the trip):");
    expect(p).toContain("from Bengaluru to Mysore Palace");
  });
});

describe("writeStory", () => {
  const words = (n: number) => Array.from({ length: n }, () => "ಕೋಟೆ").join(" ");
  const ok = { title: "ಕೋಟೆ", script: words(115), factsUsed: ["fact"] };

  it("returns the draft with the model and word counts", async () => {
    const gemini = fakeGemini([ok]);
    const out = await writeStory(gemini, base);
    expect(out).toMatchObject({ title: "ಕೋಟೆ", words: 115, budget: 115, model: "gemini-3.5-flash-lite" });
    expect(gemini.calls[0].purpose).toBe("story");
    expect(gemini.calls[0]).toMatchObject({ language: "kn-IN" });
  });

  it("checks the script: wrong length, digits, km and stray scripts become problems", async () => {
    const check = (script: string) => fakeGemini([{ ...ok, script }]);
    await expect(writeStory(check(words(10)), base)).rejects.toThrow(/words; aim for about 115/);
    await expect(writeStory(check(`${words(115)} 1799`), base)).rejects.toThrow(/digits/);
    await expect(writeStory(check(`${words(114)} 5 km`), base)).rejects.toThrow(/Contains digits|km/);
    await expect(writeStory(check(`${words(100)} ${Array.from({ length: 15 }, () => "కోట").join(" ")}`), base)).rejects.toThrow(/Telugu/);
  });

  it("rejects a greeting at the start of any item but the trip intro", async () => {
    const greeted = (opening: string) => fakeGemini([{ ...ok, script: `${opening} ${words(113)}` }]);
    await expect(writeStory(greeted("ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೆ,"), base)).rejects.toThrow(/Do not greet/);
    await expect(writeStory(greeted("ಹಲೋ ಸ್ನೇಹಿತರೇ,"), { ...base, type: "town-welcome" })).rejects.toThrow(/Do not greet/);
    const en = { ...base, language: "en-IN" as const };
    const enWords = (n: number) => Array.from({ length: n }, () => "fort").join(" ");
    for (const opening of ["Hey folks,", "Hello friends!", "Namaste doston,", "Welcome back to the drive,"]) {
      await expect(writeStory(fakeGemini([{ ...ok, script: `${opening} ${enWords(185)}` }]), en)).rejects.toThrow(/Do not greet/);
    }
    // The trip intro greets once; a greeting later in a story is not an opening.
    await expect(writeStory(greeted("ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೆ,"), { ...base, type: "trip-intro", tripFacts: "x" })).resolves.toBeDefined();
    await expect(writeStory(fakeGemini([{ ...ok, script: `${words(100)} ನಮಸ್ಕಾರ ${words(13)}` }]), base)).resolves.toBeDefined();
  });

  it("tells the model only the intro greets", () => {
    expect(buildPrompt(base)).toMatch(/already under way.*do not greet/i);
    expect(buildPrompt({ ...base, type: "trip-intro", tripFacts: "x" })).not.toMatch(/do not greet/i);
  });
});
