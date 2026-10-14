// Every tunable number of the trip pipeline lives here (trip spec 5.2-5.6), so selection can be tuned in one place
// with scripts/preview-selection.ts.
import type { ItemType } from "../models/trip.model";

// v2 (2026-10-11): explicit target-script instruction and per-voice word budgets; v1 stories are not reused.
// v3 (2026-10-15): no greeting outside the trip intro, every word in the language's script (Hinglish in Devanagari).
export const PROMPT_VERSION = 3;

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
// Last tier, only for a slot nothing else reaches (every slot gets audio): close to the road, few ratings, and the
// city-edge rule does not apply (a city trip lies entirely inside it).
export const LOCAL_MAX_OFF_ROUTE_M = 3_000;
export const CITY_EDGE_M = 15_000;
export const EDGE_MIN_RATINGS = 5_000;
export const EDGE_ARTICLE_MIN_RATINGS = 1_000;
export const TOWN_MAX_OFF_ROUTE_M = 3_000;
export const TOWN_MIN_ROUTE_M = 5_000; // no "welcome to" for the city the trip starts in
export const REGION_MAX_OFF_ROUTE_M = 15_000;
export const SIDE_NONE_END_M = 1_000;

// Clusters (5.3.4). Every member is within the radius of the cluster's first place (no chaining across a city).
export const CLUSTER_RADIUS_M = 3_000;
export const CLUSTER_MIN_SIZE = 3;
export const EPISODE_BONUS = 0.5;

// Score (5.3.5).
export const HEARD_PENALTY = 3;
// Famous places first (2026-10-15): above FAMOUS_FROM_RATINGS each tenfold of ratings is worth 1 + FAME_WEIGHT instead
// of 1, so a 140 000-rating temple beats a small historic place with an article. Ordinary places score as before.
export const FAMOUS_FROM_RATINGS = 10_000;
export const FAME_WEIGHT = 2;
// A non-food place this famous joins the trip even when it lost its slot; spacing still decides (the better one stays).
export const MUST_SEE_RATINGS = 25_000;

// Slots (5.4). Denser for the first hour so a 30-minute city trip gets five stops, not three.
export const FIRST_HOUR_SLOT_MINUTES = 6;
export const SLOT_MINUTES = 10;
export const FIRST_HOUR_MINUTES = 60;
export const MIN_SLOTS = 3;
export const MAX_SLOTS = 60;
export const SHORTLIST_SIZE = 3;
export const SHORTLIST_TOWNS = 2;
// Fallback picks a town for a slot that has other candidates only when the town is this significant
// (Wikipedia article length in characters).
export const MAJOR_TOWN_LENGTH = 15_000;
export const FOOD_MIN_GAP_S = 45 * 60;
export const MIN_CURATOR_PICKS = 3;
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
export const FACTS_MAX_CHARS = 6_000;
export const FACTS_MAX_AGE_MS = 90 * 24 * 3600_000;
export const BORROW_TOWN_MAX_M = 20_000;
// A town Google finds only farther than this from its Wikipedia point is misplaced on Wikipedia and never used.
export const TOWN_CHECK_MAX_M = 10_000;
export const EPISODE_FACTS_CHARS = 2_500; // per member, so five members still fit a prompt

// Production (6.1).
export const ITEMS_IN_FLIGHT = 2;
