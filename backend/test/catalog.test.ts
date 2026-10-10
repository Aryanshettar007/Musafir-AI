import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../src/catalog/languages";
import { VOICES } from "../src/catalog/voices";
import { buildVoiceList } from "../src/services/catalog.service";

const noDemos = new Map<string, string>();

describe("buildVoiceList", () => {
  it("lists recommended voices first, then alphabetically", () => {
    const names = buildVoiceList("en-IN", undefined, noDemos).map((v) => v.name);
    expect(names.slice(0, 2)).toEqual(["Deepak", "Nalini"]);
    expect(names).toHaveLength(VOICES.length);
    expect(names.slice(2)).toEqual([...names.slice(2)].sort((a, b) => a.localeCompare(b)));
  });

  it("filters by gender", () => {
    const voices = buildVoiceList("kn-IN", "male", noDemos);
    expect(voices.every((v) => v.gender === "male")).toBe(true);
    expect(voices[0]).toMatchObject({ name: "Girish", recommended: true });
  });

  it("attaches demo URLs by voice name, null when a clip is missing", () => {
    const voices = buildVoiceList("kn-IN", "male", new Map([["Girish", "https://cdn.example/kn-IN/Girish.mp3"]]));
    expect(voices.find((v) => v.name === "Girish")?.demoUrl).toBe("https://cdn.example/kn-IN/Girish.mp3");
    expect(voices.find((v) => v.name === "Deepak")?.demoUrl).toBeNull();
  });

  it("has a recommended male and female voice that exists, for every language", () => {
    for (const { id } of LANGUAGES) {
      for (const gender of ["male", "female"] as const) {
        const recommended = buildVoiceList(id, gender, noDemos).filter((v) => v.recommended);
        expect(recommended, `${id} ${gender}`).toHaveLength(1);
      }
    }
  });
});
