import { z } from "zod";
import type { LanguageId } from "../../catalog/languages";
import { LANGUAGE_STYLES, checkScript, wordBudget } from "../../speech";

// Spoken length of an ad. The word window is derived from the 15 and 25 s ends, not from checkScript's generic
// 60 to 130 % band: that band around a 20 s target lets a 12 s ad through (it did, for Kannada).
export const AD_SECONDS = 20;
export const AD_MIN_SECONDS = 15;
export const AD_MAX_SECONDS = 25;

// No .transform(): this schema is sent to Gemini as JSON schema.
export const adSchema = z.object({ title: z.string().min(1), script: z.string().min(1) });
export type GeneratedAd = z.infer<typeof adSchema>;

export interface AdBrief {
  name: string;
  tagline: string;
  highlights: readonly string[];
  callToAction: string;
}

export interface AdWords {
  target: number;
  min: number;
  max: number;
}

export function adWords(language: LanguageId): AdWords {
  return {
    target: wordBudget(language, AD_SECONDS),
    min: wordBudget(language, AD_MIN_SECONDS),
    max: wordBudget(language, AD_MAX_SECONDS),
  };
}

// Same word count rule as checkScript: tokens with at least one letter or number.
const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

// Deterministic checks for a generated ad; problems are written for the model (appended to the retry prompt).
export function checkAd(ad: GeneratedAd, language: LanguageId): string[] {
  const words = adWords(language);
  const problems = checkScript(ad.script, language);
  const n = countWords(ad.script);
  if (n < words.min || n > words.max) {
    problems.push(`The script has ${n} words; write between ${words.min} and ${words.max} (aim for ${words.target}).`);
  }
  // The title is shown in the app, so it must not leak another script or digits either.
  problems.push(...checkScript(ad.title, language).map((p) => `Title: ${p}`));
  return problems;
}

export const AD_SYSTEM =
  "You write short audio advertisements for a road-trip audio guide. The listener is in a car and hears it once. " +
  "You use only the facts you are given and never invent anything: no prices, awards, offers, opening hours, " +
  "distances, travel times or numbers of outlets. You answer with JSON only.";

// The ad is cached per (sponsor, language, voice) and reused on every route, so it never says which side of the
// road the outlet is on or how far away it is.
export function buildAdPrompt({ brief, language }: { brief: AdBrief; language: LanguageId }): {
  system: string;
  prompt: string;
  words: AdWords;
} {
  const words = adWords(language);
  const style = LANGUAGE_STYLES[language];
  const lines = [
    `Write a sponsored radio message for "${brief.name}" of ${words.min} to ${words.max} words ` +
      `(aim for ${words.target} words, about ${AD_SECONDS} seconds spoken). Do not write fewer than ${words.min} words.`,
    `Language and style: ${style.guide}`,
    `Start with a clear cue that this is a sponsored message, like "Here's a quick sponsored message", written in the ` +
      `language's own script (never in English letters, unless the language is English or Hinglish). ` +
      `Do not call the business our partner and do not claim any relationship with it.`,
    "Write the business name and dish names in the language's own script too (transliterate them) unless the language is English or Hinglish. Do not say the outlet is new.",
    "Sound like a friendly radio jockey, not a salesperson.",
    "Write every number as words and every unit in full. Do not use digits.",
    `Facts you may use (nothing else): ${brief.tagline}. ${brief.highlights.join(". ")}.`,
    `End with this call to action, in your own words: ${brief.callToAction}.`,
    "Do not say which side of the road the outlet is on, and do not mention distances or travel times; say it is on the way.",
    `Also give a short title (at most six words) in the same language and script.`,
  ];
  return { system: AD_SYSTEM, prompt: lines.join("\n"), words };
}
