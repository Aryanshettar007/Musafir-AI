import { describe, expect, it } from "vitest";
import { buildPrompt, openingProblems, placeCard, writeStory, type WriteRequest } from "../src/pipeline/write";
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

  it("keeps a food stop without an article as the subject, with its place card", () => {
    const p = buildPrompt({
      ...base, type: "food",
      places: [
        { name: "Brahmins' Coffee Bar", kind: "poi", card: placeCard("south_indian_restaurant", 23_515) },
        { name: "Hanumanthanagar", kind: "town", facts: "Hanumanthanagar is a locality in south Bengaluru." },
      ],
    });
    expect(p).toContain("Brahmins' Coffee Bar has no article of its own. Make it the subject and the title");
    expect(p).toContain("PLACE CARD for Brahmins' Coffee Bar (from Google): South indian restaurant; hugely popular, with tens of thousands of reviews.");
    expect(p).not.toContain("keep the story about the area");
  });

  it("lets a famous place without facts be written from knowledge, with a strict rule", () => {
    const p = buildPrompt({ ...base, type: "food", places: [{ name: "Vidyarthi Bhavan", kind: "poi", known: true, card: placeCard("south_indian_restaurant", 58_783) }] });
    expect(p).toContain("KNOWN PLACE: Vidyarthi Bhavan (from Google: South indian restaurant; hugely popular, with tens of thousands of reviews)");
    expect(p).toContain("Never guess dates, names or numbers");
    expect(p).toContain("Make it the subject and the title.");
    expect(p).not.toContain("has no article of its own");
  });

  it("brings interests in only where the place fits them", () => {
    expect(buildPrompt(base)).toContain("no food tips in a story that is not about food");
  });

  it("lets only the trip intro open with a greeting", () => {
    expect(openingProblems("ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ, ಲಾಲ್‌ಬಾಗ್ ನೋಡಿ", "story")).toHaveLength(1);
    expect(openingProblems("Hey folks, look out on your left", "story")).toHaveLength(1);
    expect(openingProblems("Welcome back, this is Lalbagh", "food")).toHaveLength(1);
    expect(openingProblems("Hey folks, welcome to our drive", "trip-intro")).toEqual([]);
    expect(openingProblems("Welcome to Channapatna, the toy town", "town-welcome")).toEqual([]);
    expect(openingProblems("Look left: that teak palace is Tipu's summer home", "story")).toEqual([]);
    expect(openingProblems("Hidden history: this fort once guarded the city", "story")).toEqual([]); // "hi" only as a word
  });

  it("describes popularity in words", () => {
    expect(placeCard("cafe", 2_000)).toBe("Cafe; popular, with thousands of reviews");
    expect(placeCard("bakery", 120)).toBe("Bakery; a local favourite");
    expect(placeCard(undefined, 50_000)).toBeUndefined();
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

  it("checks the title's script like the script's", async () => {
    const gemini = fakeGemini([ok]);
    await writeStory(gemini, base);
    const validate = gemini.calls[0].validate!;
    expect(validate({ ...ok, title: "श्री कांतिरवा स्टेडियम" }).some((p) => p.startsWith("Title: Contains Devanagari letters"))).toBe(true);
    expect(validate({ ...ok, title: "ವಿದyarthi Bhavan" }).some((p) => p.startsWith("Title: Only"))).toBe(true);
    expect(validate({ ...ok, title: "ಟಿಪ್ಪು ಸುಲ್ತಾನ್ ಸಮ್ಮರ್ ಪ್ಯಾಲೇಸ್" })).toEqual([]);
  });

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
});
