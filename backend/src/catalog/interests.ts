// Interests a user can pick. Each one steers which places the trip pipeline picks and what the stories focus on,
// so every entry must be something we can find along an Indian highway.
export const INTERESTS = [
  { id: "history", label: "History & Heritage" },
  { id: "architecture", label: "Forts & Architecture" },
  { id: "spirituality", label: "Temples & Spirituality" },
  { id: "food", label: "Food & Local Eats" },
  { id: "nature", label: "Nature & Wildlife" },
  { id: "adventure", label: "Adventure & Trekking" },
  { id: "art-culture", label: "Art, Crafts & Museums" },
  { id: "legends", label: "Myths & Legends" },
  { id: "cinema", label: "Cinema & Pop Culture" },
] as const;

export type InterestId = (typeof INTERESTS)[number]["id"];

export const INTEREST_IDS = INTERESTS.map((i) => i.id) as [InterestId, ...InterestId[]];
export const DEFAULT_INTERESTS: InterestId[] = ["history", "food"];
