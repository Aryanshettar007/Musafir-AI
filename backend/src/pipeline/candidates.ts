import type { InterestId } from "../catalog/interests";
import type { GPlace } from "../clients/maps";
import type { WikiHit } from "../clients/wikipedia";
import { haversineM, projectOntoRoute, type RouteIndex } from "../geo";
import { classifyWiki, interestsFor, isHistoric, poiKind } from "./classify";
import { labelTokens, matchArticle } from "./match";
import {
  CITY_EDGE_M, CLUSTER_MIN_SIZE, CLUSTER_RADIUS_M, EDGE_ARTICLE_MIN_RATINGS, EDGE_MIN_RATINGS, EPISODE_BONUS, FAME_WEIGHT, FAMOUS_FROM_RATINGS,
  HEARD_PENALTY, LOCAL_MAX_OFF_ROUTE_M, MAX_OFF_ROUTE_M, MIN_RATINGS,
  REGION_MAX_OFF_ROUTE_M, RELAXED_MAX_OFF_ROUTE_M, RELAXED_MIN_RATINGS, TOWN_MAX_OFF_ROUTE_M, TOWN_MIN_ROUTE_M,
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

// score = log10(ratings + 1) + fame + 1.5 hasArticle + 1 isHistoric - 0.3 offRouteKm - 1.5 inCityEdge (trip spec 5.3.5),
// fame = 2 log10(ratings / 10 000) above 10 000 ratings, else 0.
export function poiScore(c: Pick<Candidate, "ratings" | "article" | "historic" | "distanceFromRouteM" | "inEdge">): number {
  const fame = c.ratings > FAMOUS_FROM_RATINGS ? FAME_WEIGHT * Math.log10(c.ratings / FAMOUS_FROM_RATINGS) : 0;
  return Math.log10(c.ratings + 1) + fame + (c.article ? 1.5 : 0) + (c.historic ? 1 : 0) - 0.3 * (c.distanceFromRouteM / 1000) - (c.inEdge ? 1.5 : 0);
}

// Towns and regions have no review counts: the article length is their importance.
export const placeScore = (length: number | undefined, distanceFromRouteM: number) =>
  Math.log10((length ?? 0) + 1) - 0.3 * (distanceFromRouteM / 1000);

// Ordering score: places the user already heard rank lower, they are not removed.
export const rank = (c: Candidate) => c.score - (c.heard ? HEARD_PENALTY : 0);

export function prepare(input: PrepareInput): Prepared {
  const { route } = input;
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
      historic: false, inEdge: edge(route, p.routeDistanceM), score: placeScore(hit.length, p.distanceFromRouteM), heard: heard.has(key),
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
      inEdge: edge(route, p.routeDistanceM), score: 0, heard: heard.has(g.id),
    };
    c.score = poiScore(c);
    pois.push(c);
  }
  return { pois, towns, regions, landmarks, counts };
}

function edge(route: RouteIndex, routeDistanceM: number): boolean {
  return routeDistanceM < CITY_EDGE_M || routeDistanceM > route.totalM - CITY_EDGE_M;
}

export type FilterMode = "strict" | "relaxed" | "local";

// Trip spec 5.3.2: story or food types (decided in prepare), close to the route, enough ratings unless there is an
// article, and inside the city edges only the very prominent. "local" (empty slots only) keeps places close to the road
// with a few ratings, city edge or not.
export function passesFilter(c: Candidate, mode: FilterMode = "strict"): boolean {
  const maxOff = mode === "strict" ? MAX_OFF_ROUTE_M : mode === "relaxed" ? RELAXED_MAX_OFF_ROUTE_M : LOCAL_MAX_OFF_ROUTE_M;
  const minRatings = mode === "strict" ? MIN_RATINGS : RELAXED_MIN_RATINGS;
  if (c.distanceFromRouteM > maxOff) return false;
  if (c.ratings < minRatings && !c.article) return false;
  if (mode !== "local" && c.inEdge && !(c.ratings >= EDGE_MIN_RATINGS || (c.article && c.ratings >= EDGE_ARTICLE_MIN_RATINGS))) return false;
  return true;
}

// Towns the route really passes through, other than the city the trip starts in.
export const passesTownFilter = (c: Candidate) => c.distanceFromRouteM <= TOWN_MAX_OFF_ROUTE_M && c.routeDistanceM >= TOWN_MIN_ROUTE_M;

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

// Non-food POIs sorted by route position; a POI joins the current group when it is within 3 km of the group's first
// place (within 3 km of any member chained 11 places across central Bengaluru into one episode). A group of 3 or more
// becomes one episode candidate (anchor = best-scoring member, score = anchor + 0.5, members in route order). Returns
// the episodes and the POIs that stay single.
export function clusterEpisodes(stories: readonly Candidate[]): { episodes: Candidate[]; singles: Candidate[] } {
  const sorted = [...stories].sort((a, b) => a.routeDistanceM - b.routeDistanceM);
  const groups: Candidate[][] = [];
  for (const c of sorted) {
    const group = groups.at(-1);
    if (group && haversineM(group[0].location, c.location) <= CLUSTER_RADIUS_M) group.push(c);
    else groups.push([c]);
  }
  const episodes: Candidate[] = [];
  const singles: Candidate[] = [];
  for (const members of groups) {
    if (members.length < CLUSTER_MIN_SIZE) {
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
      score: anchor.score + EPISODE_BONUS,
      heard: members.every((m) => m.heard),
      members,
      anchor,
    });
  }
  return { episodes, singles };
}
