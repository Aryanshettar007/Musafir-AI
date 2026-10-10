// Story languages = the languages Gnani Timbre v2.5 narrates (docs.gnani.ai/api/TTS/available-voices).
// `id` is the Gnani TTS language code. `sttLanguage` is the code for Gnani Prisma STT (voice questions),
// which has no code-mixed Hinglish, so Hinglish speech is transcribed as Hindi.
export const LANGUAGES = [
  { id: "en-IN", label: "English", sttLanguage: "en-IN" },
  { id: "hi-IN", label: "Hindi", sttLanguage: "hi-IN" },
  { id: "hi-en", label: "Hinglish (Hindi + English)", sttLanguage: "hi-IN" },
  { id: "kn-IN", label: "Kannada", sttLanguage: "kn-IN" },
  { id: "ta-IN", label: "Tamil", sttLanguage: "ta-IN" },
  { id: "te-IN", label: "Telugu", sttLanguage: "te-IN" },
  { id: "ml-IN", label: "Malayalam", sttLanguage: "ml-IN" },
  { id: "mr-IN", label: "Marathi", sttLanguage: "mr-IN" },
  { id: "bn-IN", label: "Bengali", sttLanguage: "bn-IN" },
  { id: "gu-IN", label: "Gujarati", sttLanguage: "gu-IN" },
  { id: "pa-IN", label: "Punjabi", sttLanguage: "pa-IN" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];
export const DEFAULT_LANGUAGE: LanguageId = "en-IN";
