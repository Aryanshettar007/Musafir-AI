import type { InterestId } from "../catalog/interests";

export type WikiClass = "town" | "region" | "junk" | "landmark";

const JUNK_STRONG = /(?<!hill )\bstation\b|bus stand|bus depot|bus terminal|airport|constituency|college|school|university|hospital|\b(?:disaster|accident|massacre|riots?|bombing|murder|incident|attack|battle|election|film|novel|album|song|television|series|politician|actor|actress|cricketer|footballer|writer|singer|poet|musician|saint|philosopher|scientist|freedom fighter|businessman|person)\b|\bward\b|locality|neighbou?rhood/;
const TOWN = /\b(city|town|village|suburb|municipality|municipal corporation)\b/;
const JUNK_WEAK = /\btaluk\b|\btehsil\b/;
const REGION = /\b(district|river|hills?|region|mountain range|valley|plateau|island)\b/;

// Classifies a Wikipedia article by its short description (trip spec 5.2). Only the head noun counts: "Hindu temple
// in Kolhapur district" is a landmark, "District of Maharashtra" is a region.
export function classifyWiki(description: string | undefined): WikiClass {
  if (!description) return "landmark";
  const text = description.toLowerCase();
  const head = text.split(/\b(?:in|of|on|near|at|within|located)\b|,|\(/)[0] ?? text;
  if (JUNK_STRONG.test(head)) return "junk";
  if (TOWN.test(head)) return "town";
  if (JUNK_WEAK.test(head)) return "junk";
  if (REGION.test(head)) return "region";
  return "landmark";
}

const FOOD_TYPE = /restaurant|cafe|bakery|food|meal|sweet|tiffin|snack|dhaba|coffee/;
const STORY_TYPE = /historical|monument|museum|cultural|tourist_attraction|hindu_temple|national_park|wildlife|lake|landmark|palace|fort|garden|zoo|aquarium|art_gallery|church|mosque|place_of_worship|^park$|amusement|hiking/;

// Google POI -> food or story, from its types. A food primary type wins; an attraction that also lists food is a story.
export function poiKind(primaryType: string | undefined, types: string[]): "food" | "poi" | undefined {
  if (primaryType && FOOD_TYPE.test(primaryType)) return "food";
  if (primaryType && STORY_TYPE.test(primaryType)) return "poi";
  if (types.some((t) => STORY_TYPE.test(t))) return "poi";
  if (types.some((t) => FOOD_TYPE.test(t))) return "food";
  return undefined;
}

export const isHistoric = (types: string[]) => types.some((t) => /historical|monument|landmark|fort|palace|museum/.test(t));

const has = (types: string[], re: RegExp) => types.some((t) => re.test(t));

// Interests per place from Google types and name words (trip spec 5.3).
export function interestsFor(types: string[], name: string): InterestId[] {
  const out = new Set<InterestId>();
  const n = name.toLowerCase();
  if (has(types, /^historical_|^monument$|fort|palace/) || /\b(fort|palace|monument)\b/.test(n)) out.add("history");
  if (has(types, /palace|fort|hindu_temple|monument/) || /\b(palace|fort)\b/.test(n)) out.add("architecture");
  if (has(types, /hindu_temple|place_of_worship|church|mosque/) || /\b(temple|mandir|church|mosque|dargah)\b/.test(n)) out.add("spirituality");
  if (has(types, FOOD_TYPE)) out.add("food");
  if (has(types, /national_park|wildlife_park|^lake$|^park$|garden/) || /\b(lake|park|garden|sanctuary|falls|dam)\b/.test(n)) out.add("nature");
  if (has(types, /amusement_park|hiking_area/)) out.add("adventure");
  if (has(types, /^museum$|art_gallery|cultural_landmark/)) out.add("art-culture");
  return [...out];
}
