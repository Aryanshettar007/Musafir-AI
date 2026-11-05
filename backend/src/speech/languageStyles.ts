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

const spoken = (language: string, script: string) =>
  `Natural spoken ${language} in ${script} script, the way a radio jockey talks to people in a car. Not bookish or formal. ` +
  `Common English words (fort, temple, famous) may stay in Latin script. Write numbers as words.`;

// flash-lite drifts into a neighbouring South Indian script (Kannada came back with Malayalam and Telugu letters, titles
// included) and writes about half the requested length. Say both outright; the checks still catch what slips through.
const southIndian = (language: string, script: string, others: string) =>
  `${spoken(language, script)} Every ${language} letter, in the title too, must be ${script} script: never ${others} letters, ` +
  `even for names (write names such as Mysuru or Srirangapatna in ${script} script). Use the whole word budget: ` +
  `develop the story with the details from the FACTS.`;

export const LANGUAGE_STYLES: Record<LanguageId, LanguageStyle> = {
  "en-IN": { script: "Latin", wordsPerMinute: 190, guide: "Warm, conversational Indian English. Spell out numbers and units." },
  "hi-IN": { script: "Devanagari", wordsPerMinute: 170, guide: spoken("Hindi", "Devanagari") },
  "hi-en": {
    script: "Latin",
    wordsPerMinute: 175,
    guide: "Hinglish written fully in Latin script (romanised Hindi mixed with English), casual and friendly. No Devanagari.",
  },
  "kn-IN": { script: "Kannada", wordsPerMinute: 115, guide: southIndian("Kannada", "Kannada", "Malayalam, Telugu, Tamil or Devanagari") },
  "ta-IN": { script: "Tamil", wordsPerMinute: 110, guide: southIndian("Tamil", "Tamil", "Malayalam, Telugu, Kannada or Devanagari") },
  "te-IN": { script: "Telugu", wordsPerMinute: 115, guide: southIndian("Telugu", "Telugu", "Kannada, Malayalam, Tamil or Devanagari") },
  "ml-IN": { script: "Malayalam", wordsPerMinute: 100, guide: southIndian("Malayalam", "Malayalam", "Kannada, Telugu, Tamil or Devanagari") },
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

// flash-lite consistently writes about 55% of the requested length in the South Indian languages (Kannada: 42-47 words
// for a target of 82), so the prompt asks for more than the real budget. The check still uses the real budget.
export const PROMPT_LENGTH_BIAS: Partial<Record<LanguageId, number>> = { "kn-IN": 1.5, "ta-IN": 1.5, "te-IN": 1.5, "ml-IN": 1.5 };

export function wordsPerMinute(language: LanguageId, voice?: string): number {
  return (voice !== undefined ? VOICE_WPM_OVERRIDES[language]?.[voice] : undefined) ?? LANGUAGE_STYLES[language].wordsPerMinute;
}

// Words to ask the model for so the narration lasts about `seconds`. Gemini's own duration estimates are useless.
// Pass the voice when it is known: its measured speed replaces the language average.
export function wordBudget(language: LanguageId, seconds: number, voice?: string): number {
  return Math.round((seconds * wordsPerMinute(language, voice)) / 60);
}
