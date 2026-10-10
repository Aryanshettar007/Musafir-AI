import type { LanguageId } from "./languages";

export type VoiceGender = "male" | "female";

// Gnani Timbre v2.5 voices (docs.gnani.ai/api/TTS/available-voices). Every voice can speak every language;
// nativeLanguage is the one Gnani recommends it for. Keep in sync with scripts/generate-voice-demos.ts.
export const VOICES: ReadonlyArray<{ name: string; gender: VoiceGender; nativeLanguage: string }> = [
  { name: "Ambuja", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Asmita", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Bhavna", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Brinda", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Chitra", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Deepak", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Devika", gender: "female", nativeLanguage: "en-IN" },
  { name: "Dhruva", gender: "male", nativeLanguage: "bn-IN" },
  { name: "Falak", gender: "female", nativeLanguage: "gu-IN" },
  { name: "Girish", gender: "male", nativeLanguage: "en-IN" },
  { name: "Hemraj", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Ishaan", gender: "male", nativeLanguage: "mr-IN" },
  { name: "Jalaj", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Jwala", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Kaveri", gender: "female", nativeLanguage: "en-IN" },
  { name: "Kavin", gender: "male", nativeLanguage: "kn-IN" },
  { name: "Kirra", gender: "female", nativeLanguage: "bn-IN" },
  { name: "Lavanya", gender: "female", nativeLanguage: "te-IN" },
  { name: "Lehara", gender: "female", nativeLanguage: "te-IN" },
  { name: "Mehuli", gender: "female", nativeLanguage: "pa-IN" },
  { name: "Nalini", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Noopur", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Omkar", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Poorvi", gender: "female", nativeLanguage: "hi-en" },
  { name: "Pranav", gender: "male", nativeLanguage: "en-IN" },
  { name: "Reshma", gender: "female", nativeLanguage: "ml-IN" },
  { name: "Riyaan", gender: "male", nativeLanguage: "ml-IN" },
  { name: "Roopesh", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Saanvi", gender: "female", nativeLanguage: "kn-IN" },
  { name: "Shlok", gender: "male", nativeLanguage: "en-IN" },
  { name: "Suhana", gender: "female", nativeLanguage: "te-IN" },
  { name: "Trisha", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Trupti", gender: "female", nativeLanguage: "en-IN" },
  { name: "Urmila", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Varuni", gender: "female", nativeLanguage: "te-IN" },
  { name: "Vedika", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Veera", gender: "male", nativeLanguage: "gu-IN" },
  { name: "Vikrant", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Yashvi", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Yukti", gender: "female", nativeLanguage: "te-IN" },
  { name: "Zahira", gender: "female", nativeLanguage: "mr-IN" },
  { name: "Zayan", gender: "male", nativeLanguage: "pa-IN" },
];

// Default narrator per language and gender (docs/ARCHITECTURE.md §5.1a).
// en/hi/hi-en/kn were chosen by ear. The rest are provisional: Gnani's own voice for that language, and Girish
// for Tamil/Telugu male because Gnani has no male Tamil or Telugu voice. Listen to the demos before relying on them.
export const RECOMMENDED_VOICES: Record<LanguageId, Record<VoiceGender, string>> = {
  "en-IN": { male: "Deepak", female: "Nalini" },
  "hi-IN": { male: "Deepak", female: "Nalini" },
  "hi-en": { male: "Deepak", female: "Nalini" },
  "kn-IN": { male: "Girish", female: "Nalini" },
  "ta-IN": { male: "Girish", female: "Asmita" },
  "te-IN": { male: "Girish", female: "Lavanya" },
  "ml-IN": { male: "Riyaan", female: "Reshma" },
  "mr-IN": { male: "Ishaan", female: "Zahira" },
  "bn-IN": { male: "Dhruva", female: "Kirra" },
  "gu-IN": { male: "Veera", female: "Falak" },
  "pa-IN": { male: "Zayan", female: "Mehuli" },
};

export function findVoice(name: string) {
  return VOICES.find((v) => v.name === name);
}

export function isRecommended(voice: string, language: LanguageId): boolean {
  const rec = RECOMMENDED_VOICES[language];
  return rec.male === voice || rec.female === voice;
}
