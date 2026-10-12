export const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "unspecified", label: "Prefer not to say" },
] as const;

export type GenderId = (typeof GENDERS)[number]["id"];
export const GENDER_IDS = GENDERS.map((g) => g.id) as [GenderId, ...GenderId[]];

// How Musafir treats the user's own music app (docs/ARCHITECTURE.md §5.4a).
export const MUSIC_MODES = [
  { id: "rj", label: "Radio host between songs" },
  { id: "duck-only", label: "Just lower my music during stories" },
  { id: "off", label: "No music handling" },
] as const;

export type MusicModeId = (typeof MUSIC_MODES)[number]["id"];
export const MUSIC_MODE_IDS = MUSIC_MODES.map((m) => m.id) as [MusicModeId, ...MusicModeId[]];
export const DEFAULT_MUSIC_MODE: MusicModeId = "rj";

export const AGE_RANGES = [
  { id: "under-18", label: "Under 18" },
  { id: "18-24", label: "18 – 24" },
  { id: "25-34", label: "25 – 34" },
  { id: "35-44", label: "35 – 44" },
  { id: "45-54", label: "45 – 54" },
  { id: "55-64", label: "55 – 64" },
  { id: "65+", label: "65+" },
] as const;

export type AgeRangeId = (typeof AGE_RANGES)[number]["id"];
export const AGE_RANGE_IDS = AGE_RANGES.map((a) => a.id) as [AgeRangeId, ...AgeRangeId[]];
export const DEFAULT_AGE_RANGE: AgeRangeId = "18-24";

