import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { resolveProfile, type Profile } from "../src/services/profile";

const englishDefault: Profile = {
  name: "Aryan",
  gender: "male",
  language: "en-IN",
  voiceGender: "male",
  voice: "Deepak",
  interests: ["history"],
  musicMode: "rj",
};

describe("resolveProfile for a new profile (PUT /me)", () => {
  it("fills every default when the user skips onboarding", () => {
    expect(resolveProfile(null, {})).toEqual({
      name: undefined,
      gender: "unspecified",
      age: undefined,
      language: "en-IN",
      voiceGender: "male",
      voice: "Deepak",
      interests: ["history", "food"],
      musicMode: "rj",
    });
  });

  it("defaults the narrator to the user's gender and the language's recommended voice", () => {
    expect(resolveProfile(null, { gender: "female", language: "kn-IN" })).toMatchObject({ voiceGender: "female", voice: "Nalini" });
    expect(resolveProfile(null, { gender: "male", language: "kn-IN" })).toMatchObject({ voiceGender: "male", voice: "Girish" });
    expect(resolveProfile(null, { gender: "female", language: "ta-IN" })).toMatchObject({ voiceGender: "female", voice: "Asmita" });
  });

  it("derives voiceGender from a chosen voice", () => {
    expect(resolveProfile(null, { gender: "male", voice: "Nalini" })).toMatchObject({ voiceGender: "female", voice: "Nalini" });
  });

  it("rejects an unknown voice", () => {
    expect(() => resolveProfile(null, { voice: "Morgan" })).toThrow(expect.objectContaining({ code: "UNKNOWN_VOICE" }));
  });

  it("rejects a voice that contradicts voiceGender", () => {
    const run = () => resolveProfile(null, { voice: "Deepak", voiceGender: "female" });
    expect(run).toThrow(AppError);
    expect(run).toThrow(expect.objectContaining({ code: "VOICE_GENDER_MISMATCH", status: 400 }));
  });

  it("removes duplicate interests", () => {
    expect(resolveProfile(null, { interests: ["food", "food", "nature"] }).interests).toEqual(["food", "nature"]);
  });
});

describe("resolveProfile for an update (PATCH /me)", () => {
  it("keeps fields that are not sent", () => {
    expect(resolveProfile(englishDefault, { musicMode: "off" })).toEqual({ ...englishDefault, musicMode: "off" });
  });

  it("moves a default voice to the new language's default (Deepak → Girish for Kannada)", () => {
    expect(resolveProfile(englishDefault, { language: "kn-IN" })).toMatchObject({ language: "kn-IN", voice: "Girish" });
  });

  it("keeps a hand-picked voice when the language changes", () => {
    const custom = { ...englishDefault, voice: "Pranav" };
    expect(resolveProfile(custom, { language: "kn-IN" })).toMatchObject({ language: "kn-IN", voice: "Pranav" });
  });

  it("switches to the recommended voice of the new gender", () => {
    const custom = { ...englishDefault, voice: "Pranav" };
    expect(resolveProfile(custom, { voiceGender: "female" })).toMatchObject({ voiceGender: "female", voice: "Nalini" });
  });

  it("changing the user's own gender does not change the narrator", () => {
    expect(resolveProfile(englishDefault, { gender: "female" })).toMatchObject({ voiceGender: "male", voice: "Deepak" });
  });
});
