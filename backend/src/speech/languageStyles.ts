import type { LanguageId } from "../catalog/languages";

export type Script =
  | "Latin" | "Devanagari" | "Kannada" | "Tamil" | "Telugu" | "Malayalam" | "Bengali" | "Gujarati" | "Gurmukhi";

export interface LanguageStyle {
  script: Script;
  // Spoken words per minute with Gnani. en-IN, hi-IN, hi-en and kn-IN are measured; the rest are provisional.
  wordsPerMinute: number;
  // How to write this language so Gnani reads it well, for the Gemini prompt.
  guide: string;
}

// Gnani reads a script with that language's voice, so every word must be in the script: English words are written as
// they sound (फेमस, ಟೆಂಪಲ್), never in Latin letters, which the voice mispronounces or skips.
const spoken = (language: string, script: string) =>
  `Natural spoken ${language} in ${script} script, the way a radio jockey talks to people in a car. Not bookish or formal. ` +
  `Write every word in ${script} script, including English words and names, spelled as they sound (never in Latin letters). ` +
  `Write numbers as words.`;

export const LANGUAGE_STYLES: Record<LanguageId, LanguageStyle> = {
  "en-IN": { script: "Latin", wordsPerMinute: 190, guide: "Warm, conversational Indian English. Spell out numbers and units." },
  "hi-IN": { script: "Devanagari", wordsPerMinute: 170, guide: spoken("Hindi", "Devanagari") },
  // Hinglish = everyday Hindi with English words mixed in, written in Devanagari (2026-10-15): romanised text made the
  // Hindi voice sound like it was reading English.
  "hi-en": {
    script: "Devanagari",
    wordsPerMinute: 175,
    guide:
      "Hinglish: casual, friendly everyday Hindi with common English words mixed in, written entirely in Devanagari script. " +
      "Write the English words in Devanagari as they sound (रोड ट्रिप, फेमस, टेम्पल), never in Latin letters. Write numbers as words.",
  },
  "kn-IN": { script: "Kannada", wordsPerMinute: 115, guide: spoken("Kannada", "Kannada") },
  "ta-IN": { script: "Tamil", wordsPerMinute: 110, guide: spoken("Tamil", "Tamil") },
  "te-IN": { script: "Telugu", wordsPerMinute: 115, guide: spoken("Telugu", "Telugu") },
  "ml-IN": { script: "Malayalam", wordsPerMinute: 100, guide: spoken("Malayalam", "Malayalam") },
  "mr-IN": { script: "Devanagari", wordsPerMinute: 140, guide: spoken("Marathi", "Devanagari") },
  "bn-IN": { script: "Bengali", wordsPerMinute: 150, guide: spoken("Bengali", "Bengali") },
  "gu-IN": { script: "Gujarati", wordsPerMinute: 150, guide: spoken("Gujarati", "Gujarati") },
  "pa-IN": { script: "Gurmukhi", wordsPerMinute: 170, guide: spoken("Punjabi", "Gurmukhi") },
};

// Some voices speak much faster or slower than their language's average. Girish (kn-IN) measured about 140 words per
// minute in real trip builds against the table's 115, so his stories came out far shorter than their target.
export const VOICE_WPM_OVERRIDES: Partial<Record<LanguageId, Readonly<Record<string, number>>>> = {
  "kn-IN": { Girish: 140, Nalini: 110 },
};

export function wordsPerMinute(language: LanguageId, voice?: string): number {
  return (voice !== undefined ? VOICE_WPM_OVERRIDES[language]?.[voice] : undefined) ?? LANGUAGE_STYLES[language].wordsPerMinute;
}

// Words to ask the model for so the narration lasts about `seconds`. Gemini's own duration estimates are useless.
// Pass the voice when it is known: its measured speed replaces the language average.
export function wordBudget(language: LanguageId, seconds: number, voice?: string): number {
  return Math.round((seconds * wordsPerMinute(language, voice)) / 60);
}
