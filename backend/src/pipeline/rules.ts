// Every tunable number of the trip pipeline lives here (trip spec 5.2-5.6), so selection can be tuned in one place
// with scripts/preview-selection.ts.
import type { ItemType } from "../models/trip.model";

// v2 (2026-10-11): explicit target-script instruction and per-voice word budgets; v1 stories are not reused.
// v3 (2026-10-21): a food stop without an article is the subject of its own story (place card), not the area.
// v4 (2026-10-22): famous places without an article are written from Gemini's knowledge; interests only where they fit.
// v5 (2026-10-22): only the trip intro greets; every other story starts straight with the place.
export const PROMPT_VERSION = 5;

// Discovery (5.2).
export const NEARBY_STEP_M = 15_000;
export const NEARBY_RADIUS_M = 8_000;
export const NEARBY_MAX_RESULTS = 20; // Google's cap: a call returning exactly this many is split
export const NEARBY_SPLIT_RADIUS_FACTOR = 0.75;
export const NEARBY_SPLIT_OFFSET_FACTOR = 0.5; // centres r/2 from the original centre along the diagonals
export const SIGHT_TYPES = [
  "historical_place", "historical_landmark", "monument", "museum", "cultural_landmark",
  "tourist_attraction", "hindu_temple", "national_park", "wildlife_park", "lake",
];
export const FOOD_QUERY = "famous local restaurants";
export const FOOD_SEGMENT_M = 100_000;
export const FOOD_MAX_PAGES = 2;
export const WIKI_STEP_M = 10_000;
export const WIKI_RADIUS_M = 10_000;
export const WIKI_LIMIT = 100; // the spec said 50; dense city centres (Mumbai, Pune) lose landmarks at 50
export const MAPS_CONCURRENCY = 6;

// Match (5.3.1).
export const GENERIC_WORDS = new Set([
  "temple", "sri", "shri", "sree", "the", "of", "and", "garden", "gardens", "park", "lake", "fort", "palace", "road", "beach",
]);
export const MATCH_MIN_OVERLAP = 0.5;
export const MATCH_MAX_DISTANCE_M = 3_000;
export const MATCH_SINGLE_TOKEN_MAX_DISTANCE_M = 1_500;
export const SEARCH_MATCH_MAX_DISTANCE_M = 5_000; // facts stage: matching by name search

// Filter (5.3.2).
export const MAX_OFF_ROUTE_M = 5_000;
export const MIN_RATINGS = 300;
export const RELAXED_MAX_OFF_ROUTE_M = 8_000;
export const RELAXED_MIN_RATINGS = 50;
export const CITY_EDGE_M = 15_000;
export const EDGE_MIN_RATINGS = 5_000;
export const EDGE_ARTICLE_MIN_RATINGS = 1_000;
export const TOWN_MAX_OFF_ROUTE_M = 3_000;
export const TOWN_MIN_ROUTE_M = 5_000; // no "welcome to" for the city the trip starts in
export const REGION_MAX_OFF_ROUTE_M = 15_000;
export const SIDE_NONE_END_M = 1_000;

// Clusters (5.3.4).
export const CLUSTER_RADIUS_M = 3_000;
export const CLUSTER_MIN_SIZE = 3;

// Score (5.3.5).
export const HEARD_PENALTY = 3;

// Slots (5.4).
export const SLOT_MINUTES = 10;
export const MIN_SLOTS = 3;
export const MAX_SLOTS = 60;
export const SHORTLIST_SIZE = 3;
export const SHORTLIST_TOWNS = 2;
// Fallback picks a town for a slot that has other candidates only when the town is this significant
// (Wikipedia article length in characters).
export const MAJOR_TOWN_LENGTH = 15_000;
export const FOOD_MIN_GAP_S = 45 * 60;
export const MIN_CURATOR_PICKS = 3;
// The curator (flash-lite) often answers null for slots whose places don't match the listener's interests, which left
// real trips with one item every 20 minutes. A null is honoured only when the slot's best place ranks below this
// (about a thousand ratings with no article or history bonus) AND the slot or a neighbouring slot still has an item;
// otherwise the slot gets its top entry with focus "general". Slots are about ten minutes, so this keeps roughly one
// item every ten to twenty minutes.
export const CURATOR_NULL_MAX_RANK = 3;
// A curator pick this far below its slot's best (1 = ten times fewer reviews) is replaced by the best. flash-lite chose
// Gandhi Bhavan (2 400 reviews) over Chinnaswamy Stadium (52 000) for a "history, food" listener.
export const CURATOR_MAX_RANK_GAP = 1;
export const TOWN_WELCOME_LEAD_M = 1_000;

// Spacing and triggers (5.4, 5.7).
export const SPACING_PADDING_S = 60;
export const TRIGGER_LEAD_FRACTION = 0.3;
export const TRIGGER_RADIUS_M = 400;
export const INTRO_TRIGGER_RADIUS_M = 1_000;

export const TARGET_SECONDS: Record<Exclude<ItemType, "sponsored">, number> = {
  "trip-intro": 30,
  "town-welcome": 40,
  food: 45,
  story: 60,
  episode: 150,
  "long-form": 240,
};

// Facts (5.5).
// A place this popular is famous enough for Gemini to write from its own knowledge when no article matched it (the
// facts comparison of 2026-10-21: correct on Lalbagh, Vidhana Soudha, the fort; vague or wrong on minor places).
export const KNOWN_MIN_RATINGS = 10_000;
export const FACTS_MAX_CHARS = 6_000;
export const FACTS_MAX_AGE_MS = 90 * 24 * 3600_000;
export const BORROW_TOWN_MAX_M = 20_000;
export const EPISODE_FACTS_CHARS = 2_500; // per member, so five members still fit a prompt

// Production (6.1).
export const ITEMS_IN_FLIGHT = 2;

// Trip modes. The constants above were tuned on highway trips (Bengaluru -> Mysuru, -> Mumbai). Inside one city the
// famous places are a few hundred metres apart, the whole route is "city edge", there are no towns to welcome, and a
// 3 km cluster swallows the whole centre (Bangalore Palace -> Bull Temple gave 3 episodes of 7-10 places each).
export type TripMode = "local" | "intercity";
export const LOCAL_MAX_DISTANCE_M = 40_000;

export interface TripRules {
  mode: TripMode;
  nearbyStepM: number;
  nearbyRadiusM: number;
  sightTypes: readonly string[];
  wikiStepM: number;
  wikiRadiusM: number;
  maxOffRouteM: number;
  minRatings: number;
  relaxedMaxOffRouteM: number;
  relaxedMinRatings: number;
  cityEdgeM: number; // 0 = no city-edge penalty
  towns: boolean; // town-welcomes and long-form regions
  // Which items without facts may borrow the nearest town's (see PlaceStoreDeps.borrowFor).
  borrowTownFacts: "all" | "food";
  // Landmark articles no Google place matched become candidates of their own when at least this long (characters).
  // Google's popularity ranking leaves out city landmarks such as Vidhana Soudha and Cubbon Park; Wikipedia has them.
  wikiLandmarkMinLength?: number;
  clusterRadiusM: number;
  clusterMinSize: number;
  episodeBonus: number; // an episode scores its anchor's score plus this
  articleBonus: number; // added to a Google place's score when a Wikipedia article matched it
  historicBonus: number; // added for historic types (fort, palace, monument, museum)
  // Places without an article need KNOWN_MIN_RATINGS to be shortlisted: nothing else gives them facts (no town to
  // borrow from in a city).
  requireFactsOrFame: boolean;
  // Leave out food brands with two or more branches along the route (Empire, Kamat): in a city the food stories are
  // for one-of-a-kind places (Vidyarthi Bhavan), and Gemini knows little that is specific about a chain branch.
  skipFoodChains: boolean;
  slotMinutes: number;
  minSlots: number;
  maxSlots: number;
  foodMinGapS: number;
  spacingPaddingS: number;
  // How far a story may move later along the route to make room for a locked item (the intro, an ad) instead of being
  // dropped. 0 = never move.
  maxShiftM: number;
  targetSeconds: Readonly<Record<Exclude<ItemType, "sponsored">, number>>;
}

export const INTERCITY_RULES: TripRules = {
  mode: "intercity",
  nearbyStepM: NEARBY_STEP_M,
  nearbyRadiusM: NEARBY_RADIUS_M,
  sightTypes: SIGHT_TYPES,
  wikiStepM: WIKI_STEP_M,
  wikiRadiusM: WIKI_RADIUS_M,
  maxOffRouteM: MAX_OFF_ROUTE_M,
  minRatings: MIN_RATINGS,
  relaxedMaxOffRouteM: RELAXED_MAX_OFF_ROUTE_M,
  relaxedMinRatings: RELAXED_MIN_RATINGS,
  cityEdgeM: CITY_EDGE_M,
  towns: true,
  borrowTownFacts: "all",
  clusterRadiusM: CLUSTER_RADIUS_M,
  clusterMinSize: CLUSTER_MIN_SIZE,
  episodeBonus: 1,
  articleBonus: 1.5,
  historicBonus: 1,
  requireFactsOrFame: false,
  skipFoodChains: false,
  slotMinutes: SLOT_MINUTES,
  minSlots: MIN_SLOTS,
  maxSlots: MAX_SLOTS,
  foodMinGapS: FOOD_MIN_GAP_S,
  spacingPaddingS: SPACING_PADDING_S,
  maxShiftM: 0,
  targetSeconds: TARGET_SECONDS,
};

// About one item every three minutes of city driving, each famous place its own story. City traffic averages about
// 5 m/s, so a 45 s story plus 20 s padding needs about 350 m of road.
export const LOCAL_RULES: TripRules = {
  mode: "local",
  nearbyStepM: 2_500,
  nearbyRadiusM: 2_000,
  sightTypes: [...SIGHT_TYPES, "park", "botanical_garden", "stadium", "church", "mosque"],
  wikiStepM: 3_000,
  wikiRadiusM: 3_000,
  maxOffRouteM: 2_000, // Lalbagh's pin is 1.6 km from the road past its gate
  minRatings: 1_000,
  relaxedMaxOffRouteM: 3_000,
  relaxedMinRatings: 300,
  cityEdgeM: 0,
  towns: false,
  borrowTownFacts: "food",
  wikiLandmarkMinLength: 8_000,
  clusterRadiusM: 250,
  clusterMinSize: 3,
  // A city cluster is a few neighbours, not a day trip: it should not outrank a famous single place.
  episodeBonus: 0,
  // In a city most small sights have articles and the biggest ones often don't match theirs (Google: "Sri
  // Chamarajendra Park", Wikipedia: "Cubbon Park"); 1.5 let a 2 800-rating museum outrank a 143 000-rating park.
  articleBonus: 0.5,
  // Every small city museum counts as "historic"; at 1 Gandhi Bhavan outranked Chinnaswamy Stadium.
  historicBonus: 0.3,
  requireFactsOrFame: true,
  skipFoodChains: true,
  slotMinutes: 3,
  minSlots: 3,
  maxSlots: 30,
  foodMinGapS: 15 * 60,
  spacingPaddingS: 20,
  // The trip's starting landmark (Bangalore Palace) sits under the intro; a few hundred metres later it is still in view.
  maxShiftM: 600,
  targetSeconds: { "trip-intro": 20, "town-welcome": 30, food: 35, story: 45, episode: 90, "long-form": 120 },
};

export const rulesFor = (distanceM: number): TripRules => (distanceM <= LOCAL_MAX_DISTANCE_M ? LOCAL_RULES : INTERCITY_RULES);
