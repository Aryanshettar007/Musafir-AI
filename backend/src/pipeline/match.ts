import { haversineM, type LatLng } from "../geo";
import { classifyWiki } from "./classify";
import { GENERIC_WORDS, MATCH_MAX_DISTANCE_M, MATCH_MIN_OVERLAP, MATCH_SINGLE_TOKEN_MAX_DISTANCE_M } from "./rules";
import type { Article } from "./types";

// Old and new spellings of the cities routes start and end in: Google says "Mysuru Palace", the article is "Mysore Palace".
const ALIASES: Record<string, string> = {
  mysuru: "mysore", bangalore: "bengaluru", bombay: "mumbai", calcutta: "kolkata", madras: "chennai", poona: "pune",
  trivandrum: "thiruvananthapuram", cochin: "kochi", baroda: "vadodara", mangalore: "mangaluru", belgaum: "belagavi",
  hubli: "hubballi", gulbarga: "kalaburagi", bijapur: "vijayapura", shimoga: "shivamogga", tumkur: "tumakuru",
};

// Lowercase words without accents, minus generic words ("temple", "fort", ...) and `exclude` (origin and
// destination names, which appear in half the titles along a route: "Marine Drive, Mumbai"). If that leaves nothing
// ("Mysore Palace" on a trip to Mysore Palace) the name's own words are kept, so the destination still matches.
export function nameTokens(name: string, exclude: ReadonlySet<string> = new Set()): string[] {
  const plain = name.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  const all = [...new Set(plain.split(/[^a-z]+/).filter((w) => w.length > 1 && !GENERIC_WORDS.has(w)).map((w) => ALIASES[w] ?? w))];
  const kept = all.filter((w) => !exclude.has(w));
  return kept.length > 0 ? kept : all;
}

// All words of a name, generic ones included, with old city spellings mapped.
const allWords = (name: string) =>
  name.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1).map((w) => ALIASES[w] ?? w);

// An article about the trip's own city ("Bengaluru") is never about a place in it. Without this "Bengaluru Palace"
// (whose words shrink to "bengaluru" once "palace" and the city are set aside) matched the city's article.
export const isCityTitle = (title: string, exclude: ReadonlySet<string>) => {
  const words = allWords(title.split(",")[0]);
  return words.length > 0 && words.every((w) => exclude.has(w));
};

// Same name, spelling of the city aside: "Bangalore Palace" and "Bengaluru Palace", "Fort Church, Bengaluru" and
// "Fort Church". For articles without coordinates, which can only be matched by name.
export const sameName = (a: string, b: string) => allWords(a.split(",")[0]).join(" ") === allWords(b.split(",")[0]).join(" ");

// Words of the trip's origin and destination labels, to leave out of name matching.
export function labelTokens(...labels: string[]): Set<string> {
  return new Set(labels.flatMap((l) => nameTokens(l)));
}

export interface MatchOptions {
  exclude?: ReadonlySet<string>;
  // Replaces the 3 km (1.5 km for a single shared token) limits: matching by name search is looser (5 km).
  maxDistanceM?: number;
}

// Does this Wikipedia article describe the Google POI? Name overlap (shared tokens / the POI's tokens) of at least
// 0.5 and close enough: 3 km (roads, beaches, forts and gardens are large), or 1.5 km when only one token is
// shared. Junk, town and region articles never match a POI. Returns the overlap, or undefined for no match.
export function matchScore(poiName: string, poiLocation: LatLng, article: Article, opts: MatchOptions = {}): { overlap: number; distanceM: number } | undefined {
  // Cheapest rejection first: most articles on a 1 000 km route are nowhere near the POI.
  const distanceM = haversineM(poiLocation, article.location);
  const maxM = opts.maxDistanceM ?? MATCH_MAX_DISTANCE_M;
  if (distanceM > maxM) return undefined;
  if (classifyWiki(article.description) !== "landmark") return undefined;
  const exclude = opts.exclude ?? new Set<string>();
  if (isCityTitle(article.title, exclude)) return undefined;
  const poi = nameTokens(poiName, exclude);
  if (poi.length === 0) return undefined;
  // A name that is only the city plus a generic word ("Bengaluru Fort") shares the city with half the articles around
  // it: it matched "Fort Church, Bengaluru". Such names need the same name ("Bangalore Fort").
  if (poi.every((t) => exclude.has(t))) return sameName(poiName, article.title) ? { overlap: 1, distanceM } : undefined;
  const titleTokens = nameTokens(article.title, exclude);
  // The title's words run together count as one more word: "Lalbagh Botanical Garden" shares "lalbagh" with "Lal Bagh".
  const title = new Set([...titleTokens, titleTokens.join("")]);
  const shared = poi.filter((t) => title.has(t)).length;
  const overlap = shared / poi.length;
  if (shared === 0 || overlap < MATCH_MIN_OVERLAP) return undefined;
  const limit = opts.maxDistanceM ?? (shared === 1 ? MATCH_SINGLE_TOKEN_MAX_DISTANCE_M : MATCH_MAX_DISTANCE_M);
  return distanceM <= limit ? { overlap, distanceM } : undefined;
}

// Best article for a POI: highest overlap, then nearest.
export function matchArticle(poiName: string, poiLocation: LatLng, articles: readonly Article[], opts: MatchOptions = {}): Article | undefined {
  let best: { article: Article; overlap: number; distanceM: number } | undefined;
  for (const article of articles) {
    const m = matchScore(poiName, poiLocation, article, opts);
    if (!m) continue;
    if (!best || m.overlap > best.overlap || (m.overlap === best.overlap && m.distanceM < best.distanceM)) best = { article, ...m };
  }
  return best?.article;
}
