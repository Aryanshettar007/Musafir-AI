import type { InterestId } from "../catalog/interests";
import type { GPlace } from "../clients/maps";
import type { WikiHit } from "../clients/wikipedia";
import { haversineM, projectOntoRoute, type RouteIndex } from "../geo";
import { classifyWiki, interestsFor, isHistoric, isWikiSight, poiKind } from "./classify";
import { labelTokens, matchArticle } from "./match";
import {
  EDGE_ARTICLE_MIN_RATINGS, EDGE_MIN_RATINGS, HEARD_PENALTY, INTERCITY_RULES, KNOWN_MIN_RATINGS, REGION_MAX_OFF_ROUTE_M, TOWN_MAX_OFF_ROUTE_M, TOWN_MIN_ROUTE_M,
  type TripRules,
} from "./rules";
import type { Article, Candidate } from "./types";

export interface PrepareInput {
  route: RouteIndex;
  google: readonly GPlace[];
  wiki: readonly WikiHit[];
  originLabel: string;
  destinationLabel: string;
  // Keys (googlePlaceId or "wiki:<pageId>") of places the user completed on earlier trips.
  heardKeys?: ReadonlySet<string>;
  rules?: TripRules;
}

// Everything discovery found, projected onto the route, classified and matched. Nothing is dropped here except
// results that are neither a story nor a food place.
export interface Prepared {
  pois: Candidate[]; // stories and food
  towns: Candidate[];
  regions: Candidate[];
  // Landmark articles, kept for name matching in the facts stage.
  landmarks: Article[];
  // Articles by class, for counting in tuning output.
  counts: { landmark: number; town: number; region: number; junk: number };
}

export const wikiKey = (pageId: number) => `wiki:${pageId}`;

const toArticle = (h: WikiHit): Article => ({
  pageId: h.pageId, title: h.title, location: h.location, wikidataId: h.wikidataId, description: h.description, length: h.length,
});

// score = log10(ratings + 1) + 1.5 hasArticle (0.5 in a city) + 1 isHistoric (0.3) - 0.3 offRouteKm - 1.5 inCityEdge
// (trip spec 5.3.5).
export function poiScore(
  c: Pick<Candidate, "ratings" | "article" | "historic" | "distanceFromRouteM" | "inEdge">, rules: TripRules = INTERCITY_RULES,
): number {
  return Math.log10(c.ratings + 1) + (c.article ? rules.articleBonus : 0) + (c.historic ? rules.historicBonus : 0) - 0.3 * (c.distanceFromRouteM / 1000) - (c.inEdge ? 1.5 : 0);
}

// Towns and regions have no review counts: the article length is their importance.
export const placeScore = (length: number | undefined, distanceFromRouteM: number) =>
  Math.log10((length ?? 0) + 1) - 0.3 * (distanceFromRouteM / 1000);

// Ordering score: places the user already heard rank lower, they are not removed.
export const rank = (c: Candidate) => c.score - (c.heard ? HEARD_PENALTY : 0);

export function prepare(input: PrepareInput): Prepared {
  const { route } = input;
  const rules = input.rules ?? INTERCITY_RULES;
  const exclude = labelTokens(input.originLabel, input.destinationLabel);
  const heard = input.heardKeys ?? new Set<string>();
  const counts = { landmark: 0, town: 0, region: 0, junk: 0 };
  const landmarks: Article[] = [];
  const towns: Candidate[] = [];
  const regions: Candidate[] = [];

  for (const hit of input.wiki) {
    const cls = classifyWiki(hit.description);
    counts[cls]++;
    const article = toArticle(hit);
    if (cls === "landmark") landmarks.push(article);
    if (cls !== "town" && cls !== "region") continue;
    const p = projectOntoRoute(route, hit.location);
    const key = wikiKey(hit.pageId);
    const maxOff = cls === "town" ? TOWN_MAX_OFF_ROUTE_M : REGION_MAX_OFF_ROUTE_M;
    if (p.distanceFromRouteM > maxOff) continue;
    const c: Candidate = {
      key, kind: cls, name: hit.title, location: hit.location, types: [], ratings: 0, article,
      interests: [], distanceFromRouteM: p.distanceFromRouteM, routeDistanceM: p.routeDistanceM, side: p.side,
      historic: false, inEdge: edge(route, p.routeDistanceM, rules), score: placeScore(hit.length, p.distanceFromRouteM), heard: heard.has(key),
    };
    (cls === "town" ? towns : regions).push(c);
  }

  const pois: Candidate[] = [];
  for (const g of input.google) {
    const kind = poiKind(g.primaryType, g.types);
    if (!kind) continue;
    const p = projectOntoRoute(route, g.location);
    const article = kind === "poi" ? matchArticle(g.name, g.location, landmarks, { exclude }) : undefined;
    const c: Candidate = {
      key: g.id, kind, name: article?.title ?? g.name, location: g.location, googlePlaceId: g.id, primaryType: g.primaryType,
      types: g.types, ratings: g.userRatingCount ?? 0, article, interests: interestsFor(g.types, g.name),
      distanceFromRouteM: p.distanceFromRouteM, routeDistanceM: p.routeDistanceM, side: p.side, historic: isHistoric(g.types),
      inEdge: edge(route, p.routeDistanceM, rules), score: 0, heard: heard.has(g.id),
    };
    c.score = poiScore(c, rules);
    pois.push(c);
  }
  if (rules.wikiLandmarkMinLength !== undefined) {
    const matched = new Set(pois.flatMap((c) => (c.article ? [c.article.pageId] : [])));
    for (const hit of input.wiki) {
      const a = toArticle(hit);
      if (matched.has(a.pageId) || (a.length ?? 0) < rules.wikiLandmarkMinLength || !isWikiSight(a.title, a.description)) continue;
      const p = projectOntoRoute(route, a.location);
      if (p.distanceFromRouteM > rules.relaxedMaxOffRouteM) continue;
      pois.push(articleCandidate(a, p, heard, rules, route));
    }
  }
  return { pois, towns, regions, landmarks, counts };
}

// A landmark known only from Wikipedia. It has no review count, so its article length stands in for popularity:
// a 15 000-character article scores like a place with 15 000 ratings and no article. No article bonus: length is a
// weaker signal than ratings, and with it minor churches outranked Chinnaswamy Stadium.
function articleCandidate(
  a: Article, p: ReturnType<typeof projectOntoRoute>, heard: ReadonlySet<string>, rules: TripRules, route: RouteIndex,
): Candidate {
  const key = wikiKey(a.pageId);
  const historic = /histor|fort|palace|monument|museum|heritage/.test((a.description ?? "").toLowerCase());
  return {
    key, kind: "poi", name: a.title, location: a.location, types: [], ratings: 0, article: a,
    interests: interestsFor([], `${a.title} ${a.description ?? ""}`), distanceFromRouteM: p.distanceFromRouteM,
    routeDistanceM: p.routeDistanceM, side: p.side, historic, inEdge: edge(route, p.routeDistanceM, rules),
    score: Math.log10((a.length ?? 0) + 1) + (historic ? rules.historicBonus : 0) - 0.3 * (p.distanceFromRouteM / 1000), heard: heard.has(key),
  };
}

function edge(route: RouteIndex, routeDistanceM: number, rules: TripRules): boolean {
  return routeDistanceM < rules.cityEdgeM || routeDistanceM > route.totalM - rules.cityEdgeM;
}

export type FilterMode = "strict" | "relaxed";

// Trip spec 5.3.2: story or food types (decided in prepare), close to the route, enough ratings unless there is an
// article, and inside the city edges only the very prominent.
export function passesFilter(c: Candidate, mode: FilterMode = "strict", rules: TripRules = INTERCITY_RULES): boolean {
  const maxOff = mode === "strict" ? rules.maxOffRouteM : rules.relaxedMaxOffRouteM;
  const minRatings = mode === "strict" ? rules.minRatings : rules.relaxedMinRatings;
  if (c.distanceFromRouteM > maxOff) return false;
  if (c.ratings < minRatings && !c.article) return false;
  if (rules.requireFactsOrFame && !c.article && c.ratings < KNOWN_MIN_RATINGS) return false;
  if (c.inEdge && !(c.ratings >= EDGE_MIN_RATINGS || (c.article && c.ratings >= EDGE_ARTICLE_MIN_RATINGS))) return false;
  return true;
}

// Towns the route really passes through, other than the city the trip starts in. A local trip has none.
export const passesTownFilter = (c: Candidate, rules: TripRules = INTERCITY_RULES) =>
  rules.towns && c.distanceFromRouteM <= TOWN_MAX_OFF_ROUTE_M && c.routeDistanceM >= TOWN_MIN_ROUTE_M;

// The chain a food place belongs to: "MTR - Best in Chitradurga" -> "mtr", "Maddur Tiffanys @ Nidagatta" -> "maddurtiffanys".
export function brand(name: string): string {
  return name
    .toLowerCase()
    .split(/[-,(|@]/)[0]
    .replace(/\b(restaurant|hotel|cafe|the)\b/g, "")
    .replace(/[^a-z]/g, "");
}

// Food places grouped by brand, the most-reviewed branch of each kept.
export function dedupeChains(food: readonly Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of food) {
    const b = brand(c.name) || c.key;
    const cur = best.get(b);
    if (!cur || c.ratings > cur.ratings) best.set(b, c);
  }
  return food.filter((c) => best.get(brand(c.name) || c.key) === c);
}

const CHAIN_FILLER = new Set(["the", "new", "old", "sri", "shri", "sree", "hotel", "hotels", "cafe", "restaurant", "the"]);

// The word a food chain's branches share: "Empire Restaurant Majestic" and "Empire Restaurant vasanth nagar" -> "empire",
// "KAMAT RESTAURANT" and "Kamat Bugle Rock" -> "kamat". brand() only splits on separators ("MTR - Best in ...").
export function chainWord(name: string): string | undefined {
  const words = name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 0 && !CHAIN_FILLER.has(w));
  return words[0] && words[0].length >= 4 ? words[0] : undefined;
}

// Chain words with two or more branches among these food places.
export function chainBrands(food: readonly Candidate[]): Set<string> {
  const count = new Map<string, number>();
  for (const c of food) {
    const w = chainWord(c.name);
    if (w) count.set(w, (count.get(w) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= 2).map(([w]) => w));
}

// Two pins on the same article (Marine Drive has two) would be written twice: keep the better one.
export function dedupeArticles(list: readonly Candidate[]): Candidate[] {
  const best = new Map<number, Candidate>();
  for (const c of list) {
    if (!c.article) continue;
    const cur = best.get(c.article.pageId);
    if (!cur || rank(c) > rank(cur)) best.set(c.article.pageId, c);
  }
  return list.filter((c) => !c.article || best.get(c.article.pageId) === c);
}

// Non-food POIs sorted by route position; a POI joins the current group when it is within 3 km (250 m in a city) of
// any member. A group of 3 or more becomes one episode candidate (anchor = best-scoring member, score = anchor + 1 (+0 in a city), members in route
// order). Returns the episodes and the POIs that stay single.
export function clusterEpisodes(stories: readonly Candidate[], rules: TripRules = INTERCITY_RULES): { episodes: Candidate[]; singles: Candidate[] } {
  const sorted = [...stories].sort((a, b) => a.routeDistanceM - b.routeDistanceM);
  const groups: Candidate[][] = [];
  for (const c of sorted) {
    const group = groups.at(-1);
    if (group && group.some((m) => haversineM(m.location, c.location) <= rules.clusterRadiusM)) group.push(c);
    else groups.push([c]);
  }
  const episodes: Candidate[] = [];
  const singles: Candidate[] = [];
  for (const members of groups) {
    if (members.length < rules.clusterMinSize) {
      singles.push(...members);
      continue;
    }
    const anchor = members.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    const interests = [...new Set(members.flatMap((m) => m.interests))] as InterestId[];
    episodes.push({
      ...anchor,
      key: `episode:${anchor.key}`,
      kind: "episode",
      name: anchor.name,
      interests,
      score: anchor.score + rules.episodeBonus,
      heard: members.every((m) => m.heard),
      members,
      anchor,
    });
  }
  return { episodes, singles };
}
