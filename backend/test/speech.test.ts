import { parseBuffer } from "music-metadata";
import { describe, expect, it } from "vitest";
import { LANGUAGE_IDS } from "../src/catalog/languages";
import { chunkScript } from "../src/speech/chunk";
import { LANGUAGE_STYLES, wordBudget } from "../src/speech/languageStyles";
import { narrate } from "../src/speech/narrate";
import { checkScript } from "../src/speech/scriptCheck";
import { fakeGnani, SHORT_MP3 } from "./helpers/fakes";

describe("chunkScript", () => {
  it("keeps a short script in one chunk", () => {
    expect(chunkScript("One. Two. Three.")).toEqual(["One. Two. Three."]);
  });

  it("splits on sentence boundaries without exceeding the limit", () => {
    const sentence = "This is a sentence of moderate length that fills space.";
    const text = Array(200).fill(sentence).join(" ");
    const chunks = chunkScript(text, 1800);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1800);
      expect(c.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ")).toBe(text);
  });

  it("treats the danda, double danda, ? ! and newlines as sentence ends", () => {
    const text = "पहला वाक्य। दूसरा वाक्य॥ हाँ!\nचौथा? पाँचवाँ";
    expect(chunkScript(text, 14)).toEqual(["पहला वाक्य।", "दूसरा वाक्य॥", "हाँ! चौथा?", "पाँचवाँ"]);
  });

  it("splits one over-long sentence on commas, then on spaces", () => {
    const withCommas = Array(30).fill("alpha beta gamma").join(", ") + ".";
    const chunks = chunkScript(withCommas, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.length).toBeGreaterThan(3);

    const noCommas = Array(60).fill("word").join(" ");
    const bySpace = chunkScript(noCommas, 50);
    expect(bySpace.every((c) => c.length <= 50)).toBe(true);
    expect(bySpace.join(" ")).toBe(noCommas);
  });

  it("hard-splits a single word longer than the limit", () => {
    expect(chunkScript("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("never loses a character, even stray end marks after newlines", () => {
    const text = "?? Odd start.\n. Then a dot line\n\n! And “quoted.” Last bit, no stop";
    const squash = (s: string) => s.replace(/\s+/g, "");
    for (const max of [5, 12, 40, 1800]) {
      const chunks = chunkScript(text, max);
      expect(chunks.every((c) => c.length <= max)).toBe(true);
      expect(squash(chunks.join(""))).toBe(squash(text));
    }
  });

  it("returns nothing for blank text", () => {
    expect(chunkScript("  \n ")).toEqual([]);
  });
});

describe("languageStyles", () => {
  it("covers all 11 languages with a script, a words-per-minute rate and a guide", () => {
    expect(Object.keys(LANGUAGE_STYLES).sort()).toEqual([...LANGUAGE_IDS].sort());
    for (const s of Object.values(LANGUAGE_STYLES)) {
      expect(s.wordsPerMinute).toBeGreaterThan(50);
      expect(s.guide.length).toBeGreaterThan(20);
    }
  });

  it("computes word budgets from the measured rates", () => {
    expect(wordBudget("en-IN", 60)).toBe(190);
    expect(wordBudget("kn-IN", 60)).toBe(115);
    expect(wordBudget("kn-IN", 40)).toBe(77);
  });

  it("uses a voice's measured speed when it has one, else the language average", () => {
    expect(wordBudget("kn-IN", 60, "Girish")).toBe(140);
    expect(wordBudget("kn-IN", 40, "Girish")).toBe(93);
    expect(wordBudget("kn-IN", 60, "Nalini")).toBe(110);
    expect(wordBudget("kn-IN", 60, "Somebody")).toBe(115);
    // Overrides are per language: Nalini in English keeps the English rate.
    expect(wordBudget("en-IN", 60, "Nalini")).toBe(190);
  });
});

describe("checkScript", () => {
  const kannada = "ಇದು ಶ್ರೀರಂಗಪಟ್ಟಣ ಕೋಟೆ. ಇದನ್ನು ಬಹಳ ಹಿಂದೆ ಕಟ್ಟಲಾಗಿತ್ತು.";

  it("accepts clean Kannada, with English words mixed in", () => {
    expect(checkScript(kannada, "kn-IN")).toEqual([]);
    expect(checkScript(`${kannada} ಇದು ಒಂದು famous fort.`, "kn-IN")).toEqual([]);
  });

  it("flags Telugu letters in Kannada", () => {
    const problems = checkScript(`${kannada} ఇది తెలుగు`, "kn-IN");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Contains Telugu letters .*Write only in Kannada script/);
  });

  it("flags ASCII digits and says what to do", () => {
    expect(checkScript("Built in 1799 and 1800.", "en-IN")).toEqual(["Contains digits: 1799, 1800. Write numbers as words."]);
  });

  it("flags Indic digits too", () => {
    expect(checkScript("ಇದು ೧೭೯೯ ರಲ್ಲಿ ಕಟ್ಟಲಾಯಿತು.", "kn-IN")).toEqual(["Contains digits: ೧೭೯೯. Write numbers as words."]);
    expect(checkScript("यह १७९९ में बना।", "hi-IN")[0]).toMatch(/Contains digits: १७९९/);
  });

  it("flags km and kms but not words that merely contain them", () => {
    expect(checkScript("Two km ahead", "en-IN")[0]).toMatch(/Contains "km"/);
    expect(checkScript("Two KMS ahead", "en-IN")[0]).toMatch(/kilometres/);
    expect(checkScript("A skm kmart", "en-IN")).toEqual([]);
    expect(checkScript("It is 5km away", "en-IN").some((p) => p.includes('"km"'))).toBe(true);
    expect(checkScript("ಕೋಟೆ ಎರಡು km ದೂರ", "kn-IN")[0]).toMatch(/Contains "km"/);
  });

  it("flags Devanagari in Hinglish and in English", () => {
    const problems = checkScript("Yeh bahut famous jagah hai, नमस्ते", "hi-en");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Devanagari letters .*Latin script/);
    expect(checkScript("Hello नमस्ते", "en-IN")[0]).toMatch(/Devanagari/);
  });

  it("accepts Hinglish in Latin script", () => {
    expect(checkScript("Yeh kila bahut purana hai aur bahut famous bhi.", "hi-en")).toEqual([]);
  });

  it("flags Indic text with fewer than 60 percent letters in the expected script", () => {
    const problems = checkScript("ಇದು the old fort of the great king and his big army", "kn-IN");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Only \d+% of the letters are Kannada script; at least 60% must be/);
  });

  it("treats Hindi and Marathi as Devanagari and Kannada letters in Hindi as stray", () => {
    expect(checkScript("यह एक पुराना किला है।", "hi-IN")).toEqual([]);
    expect(checkScript("यह एक पुराना किला है। ಕೋಟೆ", "mr-IN")[0]).toMatch(/Kannada letters/);
  });

  it("checks the word count against 60 to 130 percent of the budget", () => {
    const words = (n: number) => Array(n).fill("word").join(" ");
    expect(checkScript(words(100), "en-IN", { wordBudget: 100 })).toEqual([]);
    expect(checkScript(words(60), "en-IN", { wordBudget: 100 })).toEqual([]);
    expect(checkScript(words(130), "en-IN", { wordBudget: 100 })).toEqual([]);
    expect(checkScript(words(59), "en-IN", { wordBudget: 100 })[0]).toBe("The script has 59 words; aim for about 100 (allowed 60 to 130).");
    expect(checkScript(words(131), "en-IN", { wordBudget: 100 })).toHaveLength(1);
    expect(checkScript(words(5), "en-IN")).toEqual([]);
    // Punctuation standing alone (a spaced danda or dash) is not a word.
    expect(checkScript(`${words(60)} — । ॥`, "en-IN", { wordBudget: 100 })).toEqual([]);
    expect(checkScript(`${words(59)} — । ॥`, "en-IN", { wordBudget: 100 })).toHaveLength(1);
  });

  it("reports every problem at once", () => {
    expect(checkScript("Two km, 5 miles ఇది", "en-IN")).toHaveLength(3);
  });
});

describe("narrate", () => {
  it("narrates a short script as one TTS call and reads the duration from the mp3", async () => {
    const gnani = fakeGnani();
    const result = await narrate(gnani, { text: "ಒಂದು ವಾಕ್ಯ.", voice: "Girish", language: "kn-IN", priority: "background" });
    expect(gnani.calls).toEqual([{ kind: "tts", priority: "background", text: "ಒಂದು ವಾಕ್ಯ.", voice: "Girish", language: "kn-IN" }]);
    const fixtureDuration = (await parseBuffer(SHORT_MP3, { mimeType: "audio/mpeg" })).format.duration!;
    expect(fixtureDuration).toBeGreaterThan(2);
    expect(result.bytes).toBe(SHORT_MP3.length);
    expect(result.durationS).toBeCloseTo(fixtureDuration, 1);
  });

  it("chunks a long script, calls TTS in order and concatenates the audio", async () => {
    const gnani = fakeGnani();
    const sentence = "This sentence is repeated to make a long script.";
    const text = Array(100).fill(sentence).join(" "); // ~4 900 chars -> 3 chunks
    const result = await narrate(gnani, { text, voice: "Deepak", language: "en-IN", priority: "interactive" });
    expect(gnani.calls).toHaveLength(3);
    expect(gnani.calls.every((c) => c.priority === "interactive" && (c.text?.length ?? 0) <= 1800)).toBe(true);
    expect(gnani.calls.map((c) => c.text).join(" ")).toBe(text);
    expect(result.bytes).toBe(SHORT_MP3.length * 3);
    const single = (await parseBuffer(SHORT_MP3, { mimeType: "audio/mpeg" })).format.duration!;
    expect(result.durationS).toBeGreaterThan(single * 2.8);
    expect(result.durationS).toBeLessThan(single * 3.2);
  });

  it("refuses empty text", async () => {
    await expect(narrate(fakeGnani(), { text: " ", voice: "Deepak", language: "en-IN", priority: "background" })).rejects.toThrow(/empty/);
  });
});
