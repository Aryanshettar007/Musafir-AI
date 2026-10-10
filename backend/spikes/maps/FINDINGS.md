# Spike 3 — Google Maps (Routes + Places) + Wikipedia discovery findings

> Throwaway spike, run 2026-10-10 on Bengaluru → Mysore Palace. Scripts: `discovery-probe.ts` (API calls),
> `select-probe.ts` (offline ranking over the saved results), `geo.ts` (route geometry), `client.ts`.
> Outputs: `backend/spikes/out/maps/discovery.json`, `trip.geojson`.

## Setup
- Env var `GOOGLE_MAPS_API_KEY` (the `.env` line has an inline `# comment`, which dotenv strips; a shell
  `cut` does not, so read it through dotenv).
- Routes API: `POST https://routes.googleapis.com/directions/v2:computeRoutes`. Places API (New):
  `POST https://places.googleapis.com/v1/places:searchText` and `:searchNearby`. Auth is the `X-Goog-Api-Key`
  header, and **the `X-Goog-FieldMask` header is mandatory** (it also decides the billing SKU).
- Wikipedia: `action=query&list=geosearch` (radius ≤ 10 km, ≤ 500 results). **Needs a descriptive User-Agent with
  a contact URL.** A generic UA got `429 You are making too many requests` even for sequential calls.

## Route
Bengaluru → Mysore Palace: **138.5 km, 151 min, 1 122 polyline points (4 150-char encoded polyline), 0.47 s.**

## Discovery: three strategies

Recall is measured against 13 well-known stops (Srirangapatna fort, Ranganathaswamy, Daria Daulat Bagh, Gumbaz,
Ranganathittu, Nimishamba, Channapatna, Ramanagara/Ramadevara Betta, Janapada Loka, Mysuru Palace,
Brindavan/KRS, Maddur vada, Kamat Lokaruchi).

| Strategy | Calls | Time | Places ≤ 8 km of route | Recall | Notes |
|---|---|---|---|---|---|
| A) Text Search **along route** (4 queries: historical, tourist attractions, temples, local restaurants) | 4 | 1.2 s | 58 | 6/13 | Biased to the two city ends; only 18 results in the 100 km middle. **Best for food** (found Maddur Tiffany's ×3). |
| B) **Nearby Search** every 15 km, r = 8 km, 10 culture/nature/temple types | 11 | 0.5 s | 192 | **10/13** | Good coverage of the middle: Sholay spot / vulture sanctuary, Kanva reservoir, Ambegal Krishna, Hoysala temples, Payana car museum. Lots of noise (tiny village temples with < 100 reviews). |
| C) **Wikipedia geosearch** every 10 km, r = 10 km | 15 | 6.7 s | 359 | **11/13** | Finds **towns** (Bidadi, Ramanagara, Channapatna, Mandya) and Janapada Loka, which Google misses. Very noisy (metro stations, colleges, constituencies) and has **no popularity signal**. |
| A ∪ B ∪ C | 30 | | | 11/13 | Brindavan/KRS (> 8 km off route) and Kamat Lokaruchi never appeared. |

## Draft selection (`select-probe.ts`, no AI)
Filter (≤ 5 km off route, ≥ 300 reviews, story/food types) → score (log reviews + Wikipedia bonus + history bonus −
detour − city-centre penalty) → greedy pick with ≥ 4 km spacing → **19 items**:

> Tipu's Summer Palace (Bengaluru) · city temples · Wonderla area · Nelligudde viewpoint · **Ramadevara Betta vulture
> sanctuary / Sholay hills** · Rangarayana Doddi lake · **Kanva reservoir** · **Ambegal Krishna temple** ·
> **Maddur Tiffany's** ×3 · **Mandya** · **Daria Daulat Bagh** · **Payana Car Museum** · GRS park · **Mysuru Palace**

That's a recognisable, decent trip already. Problems the real ranking must fix:
1. **Chains:** three Maddur Tiffany's branches. Dedupe by normalised brand name and cap food items.
2. **Clusters:** Srirangapatna has 5 sights within 5 km (Nimishamba, Daria Daulat, Gumbaz, Ranganathaswamy,
   Ranganathittu). Spacing keeps only one. These should become **one longer "episode"** covering the cluster.
3. **Towns:** "Welcome to Channapatna (toys) / Ramanagara / Mandya" items must come from Wikipedia (or a locality
   lookup). Google Places doesn't return towns.
4. **Gaps:** 28 km with no content (Mandya → Srirangapatna). Fill with regional stories (Kaveri, sugar, silk) or a
   5-minute long-form episode (spike 1 showed long-form works).
5. **Wikipedia matching by name + distance gives false positives** ("Maddur Tiffany's" → Maddur town). Match on title
   similarity + type, or use Wikidata/Wikipedia search by name, then confirm by coordinates.

## Geometry (`geo.ts`) — works, needs a visual check
- Polyline decode, route indexing, projection (distance from route, position along route, **left/right by the cross
  product** of travel direction × place vector) are all fast and deterministic. ~1 100 points × 400 places is instant.
- **Not yet verified against reality:** drop `out/maps/trip.geojson` on https://geojson.io and check that orange
  markers (computed *left*) really are on the left when driving Bengaluru → Mysuru.
- Edge case: places at the very start/end (inside the cities) project onto the first/last segment, so "side" is
  meaningless there. Use "nearby" wording instead of left/right within ~1 km of the endpoints.

## Gotchas
1. Field masks are mandatory, and asking for `rating`, `userRatingCount` or `editorialSummary` puts calls into a
   pricier Places SKU. Request only what the ranking needs. **~16 Places calls per route** (uncached).
2. Text Search returns at most 60 results (3 pages of 20). Nearby Search returns at most 20 per call with no paging,
   so popular areas need smaller radii or more sample points.
3. Wikipedia: descriptive User-Agent, sequential calls, retry 429 with backoff.
4. **⚠ Google Maps Platform terms restrict caching Places content** (place IDs can be stored; other fields only
   briefly). Our story cache (D2) and offline packs must be built from *our own* content (Gemini prose from
   Wikipedia facts) keyed by `place_id`, not by storing Google ratings/names/reviews long term. **Verify the exact
   terms before slice 1.**
5. Gemini "Grounding with Google Maps" was not tested: it is English-only with attribution rules (see spike 2), a
   poor fit for pre-generated Kannada audio. Revisit for live English Q&A ("where should we eat?").

## Recommendation for the trip pipeline
1. **Route** via Routes API (one call).
2. **Candidates** = Nearby Search every ~15 km (culture/nature/temple types) **+** one or two Text Search
   along-route queries for **food** **+** Wikipedia geosearch for **towns** and facts.
3. **Deterministic pre-filter** (distance, review count, types, chain dedupe, cluster detection) → ~40–60 candidates.
4. **Gemini curator pass** (cheap, one call): given the candidates, the user's interests and the trip length, choose
   and group items into episodes (clusters → one episode, gaps → long-form), in route order. This is where AI beats
   hand-tuned weights, and it personalises per interests.
5. **Facts** from Wikipedia (article intro + sections) for each chosen item → story writing (spike 2).
