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
