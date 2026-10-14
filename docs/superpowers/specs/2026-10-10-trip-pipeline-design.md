# Trip pipeline (offline trip packs) — design

> Status: draft for review, 2026-10-10. Branch `feature/trip-pipeline`.
> Builds on `docs/ARCHITECTURE.md` (§4 Trip Pack, §5.3 pipeline, §5.6 data model, §5.7 storage) and the findings
> of spikes 1–5 (`backend/spikes/*/FINDINGS.md`). Decisions agreed in chat on 2026-10-10 are restated here so this
> document stands on its own.

## 1. Goal and scope

The user picks a destination; the server builds a **trip pack**: an ordered list of geo-triggered audio items
(stories, town welcomes, food stops, longer episodes) narrated in the user's language and voice, stored in
Backblaze B2. The app polls the trip, downloads items as they become ready, and plays them offline by GPS.

**In scope**
- Endpoints: `GET /places/autocomplete`, `POST /trips`, `GET /trips/:id`, `GET /trips`, `POST /listens`.
- The background pipeline behind `POST /trips`: route → discover → filter → curate → facts → write → narrate → store.
- Shared building blocks the later specs reuse: Maps, Wikipedia, Gemini and Gnani clients, the single Gnani
  priority queue, the Gemini concurrency limiter.
- `scripts/build-trip.ts` to build a real trip from the command line and pre-build demo routes, and
  `scripts/preview-selection.ts` to tune place selection offline on saved discovery results.

**Out of scope (own specs, same branch, in this order)**
1. **Live mode** (`POST /ask`): voice questions answered by STT → Gemini → TTS on the server. Nothing stored.
   Gnani stays server-side (key safety, and the one-request-per-key limit would collide with trip narration).
2. **Sponsored ad demo**: a Corner House ad on Bengaluru → Mysuru, generated once (Gemini + Gnani), stored in B2,
   and added to trips as a `sponsored` item when the route passes near the outlet. It reuses this pipeline's item
   and trigger model, so this spec keeps item types extensible.
3. Radio host links (`/rj/link`) and music-break markers. Music-break markers were in the chat design; they are
   dropped here because nothing consumes them until the RJ spec.

## 2. Decisions carried in

| # | Decision |
|---|---|
| D1 | Trip Pack model: the server pre-builds everything; the app is a GPS-triggered player of downloaded files. |
| D2 | Stories are cached and shared across trips by **cache key = places + type + language + voice + focus + side**. |
| D3 | Geometry is code (side, distances, trigger points). Gemini only chooses and writes. |
| D4 | Stories use only retrieved facts (Wikipedia, English) and list `factsUsed[]`. |
| D5 | All third-party keys stay on the server. |
| S1 | **Scripts never mention distance** ("two kilometres ahead"); the trigger point handles timing. Side ("on your left") is allowed, which is why side is in the cache key. |
| S2 | **MongoDB stores storage keys, never URLs.** `GET /trips/:id` signs fresh 7-day URLs on every call. The app stores `tripId` and item ids, never URLs, and re-fetches the trip on a 403. |
| S3 | Polling, not server-sent events. One trip building at a time per user. |
| S4 | Google terms: we keep `googlePlaceId` long term. Other Google fields are a refreshable snapshot with `fetchedAt`, refreshed whenever a trip build sees the place again. Our stories are our own prose from Wikipedia facts. |

## 3. API

All routes need `Authorization: Bearer <Firebase ID token>`. Responses use the existing envelope:
`{ success: true, data }` / `{ success: false, error: { code, message, details? } }`.

### `GET /places/autocomplete?q=&lat=&lng=&sessionToken=`
Destination search box. Proxies Places Autocomplete (New), restricted to India, biased to `lat,lng` when given.
- `q`: 2–100 chars. `sessionToken`: optional UUID the app generates per search session (Google bills a session as
  one request when the chosen place is then used).
- `200 { suggestions: [{ placeId, primaryText, secondaryText }] }` (max 5).
- Errors: `VALIDATION_FAILED` 400, `UPSTREAM_UNAVAILABLE` 502.

### `POST /trips`
```jsonc
{
  "origin": { "lat": 12.97, "lng": 77.59, "label": "Current location" },   // or { "placeId": "...", "label": "..." }
  "destination": { "placeId": "ChIJ...", "label": "Mysore Palace" },
  "prefs": { "language": "kn-IN", "voice": "Girish", "interests": ["history", "food"] }   // optional, all fields optional
}
```
- Trip prefs = the user's profile with `prefs` applied by the same function as `PATCH /me` (`resolveProfile`), so
  voice defaults, gender checks and errors behave identically. The profile itself is not changed.
- The route is computed **synchronously** (~0.5 s) so routing errors come back immediately.
- `202 { tripId, status: "building" }`.
- Errors:
  | Code | Status | When |
  |---|---|---|
  | `PROFILE_NOT_FOUND` | 404 | no profile yet (app shows onboarding) |
  | `TRIP_IN_PROGRESS` | 409 | the user already has a trip with status `building`; `details.tripId` is that trip |
  | `TRIP_LIMIT_REACHED` | 429 | more than `TRIPS_PER_DAY` (default 10) trips created in the last 24 h |
  | `ROUTE_NOT_FOUND` | 422 | Google returns no drivable route |
  | `ROUTE_TOO_LONG` | 422 | route longer than `MAX_ROUTE_KM` (default 1 200; Bengaluru → Mumbai is 980) |
  | `VALIDATION_FAILED`, `UNKNOWN_VOICE`, `VOICE_GENDER_MISMATCH` | 400 | as for `/me` |
  | `UPSTREAM_UNAVAILABLE` | 502 | Routes API down after retries |

### `GET /trips/:id`
Only the owner can read a trip; anyone else gets `TRIP_NOT_FOUND` 404 (no existence leak).
```jsonc
{
  "id": "…", "status": "building",               // building | ready | failed
  "progress": { "ready": 12, "failed": 1, "total": 31 },
  "origin": { "label": "Current location", "lat": 12.97, "lng": 77.59 },
  "destination": { "label": "Mysore Palace", "lat": 12.30, "lng": 76.65 },
  "prefs": { "language": "kn-IN", "voice": "Girish", "interests": ["history", "food"], "musicMode": "rj" },
  "route": { "polyline": "encoded…", "distanceM": 138500, "durationS": 9060 },
  "items": [
    {
      "id": "…", "type": "story", "status": "ready",          // pending | ready | failed
      "title": "ಶ್ರೀರಂಗಪಟ್ಟಣ ಕೋಟೆ", "side": "right",
      "trigger": { "lat": 12.42, "lng": 76.69, "radiusM": 400, "routeDistanceM": 118300 },
      "audio": { "url": "https://s3…?X-Amz-Signature=…", "durationS": 61.2, "bytes": 955000 },
      "transcript": "…"
    }
  ],
  "totalBytes": 37500000,          // ready items only
  "createdAt": "…", "builtAt": "…"
}
```
- Items are in route order (`trigger.routeDistanceM`). `audio`/`transcript` are present only when `ready`.
- `status: "ready"` means building has finished and at least one item is ready; failed items stay listed with
  `status: "failed"` so the app can skip them. `status: "failed"` carries `failure: { code, message }`.
- The app polls every 3–5 s while `building`, and stops once the status is `ready` or `failed`.

### `GET /trips?limit=20`
The user's trips, newest first, `limit` 1–50. Summary only: `{ id, status, progress, origin.label,
destination.label, route.distanceM, route.durationS, createdAt }`. No items, no URLs.

### `POST /listens`
```jsonc
{ "events": [ { "id": "uuid-from-phone", "tripId": "…", "itemId": "…", "event": "completed", "at": "2026-10-10T08:15:00Z" } ] }
```
- `event`: `started | completed | skipped`. 1–200 events per call. The phone queues them offline and resends.
- Idempotent: `(userId, id)` is unique, so resending a batch is harmless.
- Events for trips or items the user doesn't own are rejected per event; the response says which:
  `200 { accepted: 40, rejected: [{ id, code: "TRIP_NOT_FOUND" }] }`.

## 4. Data model

### `places` — everything we might narrate, shared by all trips
```ts
{
  kind: "poi" | "town" | "region",     // region = district, river, hills (long-form stories)
  name: string,                       // Wikipedia title when matched, else the Google display name (snapshot)
  location: GeoJSON Point,            // 2dsphere index
  googlePlaceId?: string,             // unique sparse; kept long term (S4)
  google?: { primaryType, types[], userRatingCount, fetchedAt },   // refreshable snapshot (S4)
  wikipedia?: { pageId, title, url },
  wikidataId?: string,
  facts?: { text, source: "wikipedia", url, fetchedAt },           // RAG input, plain-text extract (≤ 6 000 chars)
  interests: Interest[],              // derived from types, see §5.3
  updatedAt, createdAt
}
```
Towns and regions come from Wikipedia only (`wikipedia.pageId` unique sparse). A Google POI and a Wikipedia article that are
the same place become one record (§5.5).

### `stories` — the D2 cache: written and narrated audio
```ts
{
  cacheKey: string,                   // unique, see §5.6
  type: ItemType,                     // trip-intro | story | food | town-welcome | episode | long-form
  placeIds: ObjectId[],
  language: LanguageId, voice: string,
  focus: Interest | "general",
  side: "left" | "right" | "none",
  title: string, script: string, factsUsed: string[],
  audio: { storageKey, bytes, durationS },
  models: { llm: string, tts: "timbre-v2.5" },
  promptVersion: number,
  createdAt
}
```
A story exists only once it is narrated and uploaded; a half-built story never appears in the collection.

### `trips`
```ts
{
  userId: string,                     // Firebase uid
  status: "building" | "ready" | "failed",
  stage: "discovering" | "curating" | "producing" | "done",   // resume point after a restart
  failure?: { code, message },
  origin: { label, location, placeId? }, destination: { label, location, placeId },
  prefs: { language, voice, voiceGender, interests[], musicMode },   // copied at creation
  route: { polyline, distanceM, durationS },
  items: [{
    _id, type: ItemType, status: "pending" | "ready" | "failed",
    placeIds: ObjectId[], focus, side, targetSeconds,
    anchorRouteDistanceM: number,     // where the item is "about": closest approach, town entry, gap start
    trigger?: { location: GeoJSON Point, radiusM, routeDistanceM },   // set when ready (needs real duration)
    storyId?: ObjectId,
    error?: string                    // short reason when failed, for logs and debugging
  }],
  builtAt?: Date, createdAt, updatedAt
}
```
Indexes: `{ userId: 1, createdAt: -1 }`, `{ status: 1 }` (resume scan).

### `listens`
```ts
{ userId, clientEventId, tripId, itemId, storyId, placeIds[], event, at }
```
Unique `{ userId: 1, clientEventId: 1 }`. Index `{ userId: 1, placeIds: 1 }` for "already heard" lookups.

## 5. Pipeline

`POST /trips` validates, computes the route, saves the trip with `status: building, stage: discovering`, returns
202, and hands the trip id to the **trip builder** (in-process). Each stage saves its output on the trip before the
next starts, so a restart resumes at `stage` (§6).

### 5.1 Route (synchronous)
Routes API `computeRoutes`, `travelMode: DRIVE`, field mask `routes.distanceMeters,routes.duration,
routes.polyline.encodedPolyline`. Origin as lat/lng or place id; destination as place id. Destination location
comes from the last polyline point. Average speed `v = distanceM / durationS` is used by every timing rule below.

### 5.2 Discover
Maps calls run in parallel, Wikipedia calls one at a time (descriptive User-Agent, retry 429). All from the decoded
and indexed route (`geo/`).
- **Sights: Nearby Search** at points every 15 km, radius 8 km, `rankPreference: POPULARITY`, types:
  historical_place, historical_landmark, monument, museum, cultural_landmark, tourist_attraction, hindu_temple,
  national_park, wildlife_park, lake. Field mask: id, displayName, location, primaryType, types, userRatingCount
  (no rating or editorialSummary: pricier SKU).
  **Adaptive split:** Nearby returns at most 20 places, so a call that returns exactly 20 is repeated once as
  4 overlapping circles (radius 0.75 r, centres r/2 from the original centre along the diagonals). Highways stay
  cheap; dense cities (Pune, Mumbai) get the extra calls they need.
- **Food: Text Search along route**, "famous local restaurants", run **per 100 km segment** of the route (each
  segment's own encoded polyline, up to 2 pages). One query over the whole route returned results bunched at the
  two city ends (spike 3).
- **Towns, regions and articles: Wikipedia** `generator=geosearch` every 10 km, radius 10 km, 50 results, with
  `prop=description|coordinates|info|pageprops` (`ppprop=wikibase_item`), so each hit arrives with its short
  description ("Town in Mandya district, Karnataka"), article length and Wikidata id in the same call.
  Each hit is classified by its description:

  | Class | Description matches | Used for |
  |---|---|---|
  | `town` | city, town, village, census town, suburb, municipality | town-welcome items, facts for nearby POIs |
  | `region` | district, river, hills, region | long-form stories for long empty stretches |
  | `junk` | metro station, railway station, constituency, college, school, university, hospital, taluk, ward | dropped |
  | `landmark` | anything else | matching Google POIs to articles (§5.3) |

  Wikipedia has no review counts, so article length (`info.length`) is the importance score for towns and regions.
- Every candidate is projected onto the route: `distanceFromRouteM`, `routeDistanceM`, `side`.
- Places are upserted into `places` (Google snapshot refreshed) before filtering.

Calls: Bengaluru → Mysuru (140 km) ≈ 10–16 Nearby (+ splits), ≤ 4 Text Search, ~15 Wikipedia.
Bengaluru → Mumbai (980 km) ≈ 66 Nearby (+ splits), ≤ 20 Text Search, ~100 Wikipedia (~45 s sequential).

### 5.3 Match, filter and group (code only)
Constants live in one `pipeline/rules.ts` so they are easy to tune.

**1. Match Google POIs to Wikipedia articles.** The spike's rule (one shared word, within 1.5 km) was wrong both
ways: it missed Marine Drive, whose two pins are 1.54 km apart along a 3.6 km road, and it matched Lalbagh to
"Lalbagh metro station" and Ambabai Temple to "Kolhapur district".
- Tokens: lowercase, accents removed, split on non-letters, minus generic words (temple, sri, shri, sree, the, of,
  and, garden(s), park, lake, fort, palace, road, beach) and minus the words of the origin and destination labels
  ("mumbai", "bengaluru").
- **Name overlap** = shared tokens ÷ the Google name's tokens, at least **0.5**.
- **Distance:** within **3 km** (roads, beaches, forts and gardens are large), or within **1.5 km** when only one
  token is shared.
- `junk`, `town` and `region` articles never match a POI.
- Best match = highest overlap, then nearest. The Wikidata id is stored with the article.
- POIs still unmatched are tried again by name search, but only for the items finally chosen (§5.5).

**2. Filter POIs:** ≤ 5 km off route; ≥ 300 Google ratings unless matched to an article; story or food types;
inside the first and last 15 km only POIs with ≥ 5 000 ratings, or an article and ≥ 1 000 ratings. Towns: the
route must pass within 3 km.

**3. Chains:** food places are grouped by brand and only the most-reviewed branch is kept:
```ts
const brand = (name: string) =>
  name.toLowerCase()
    .split(/[-,(|]/)[0]                                 // "MTR - Best in Chitradurga" -> "mtr "
    .replace(/\b(restaurant|hotel|cafe|the)\b/g, "")
    .replace(/[^a-z]/g, "");
```

**4. Clusters:** non-food POIs sorted by route position; a POI joins the current group when it is within **3 km**
of any member. A group of **3 or more** becomes one **episode** candidate (Srirangapatna: fort, Daria Daulat Bagh,
Gumbaz, Ranganathaswamy, Nimishamba). Its anchor is the best-scoring member, its score is the anchor's + 1, and all
members are kept, in route order, for the story.

**5. Score** (spike 3): `log10(ratings + 1) + 1.5·hasArticle + 1·isHistoric − 0.3·offRouteKm − 1.5·inCityEdge`.

**6. Heard:** candidates whose places the user `completed` on an earlier trip are flagged `heard`.

**Interests** per place come from Google types and name words: history (historical_*, monument, fort, palace),
architecture (palace, fort, hindu_temple, monument), spirituality (hindu_temple, place_of_worship, church, mosque),
food (restaurant, cafe, bakery, food), nature (national_park, wildlife_park, lake, park, garden), adventure
(amusement_park, hiking_area), art-culture (museum, art_gallery, cultural_landmark). Legends and cinema have no
Google type; the curator may choose them as `focus` from the facts.

### 5.4 Select: time slots, then one Gemini call
A global "top 30" leaves long empty stretches (28 km Mandya → Srirangapatna) and, on long routes, one item every
33 km (Bengaluru → Mumbai). Selection therefore works in **time slots**:

1. **Slots:** `slots = clamp(round(min(durationMin, 60) / 6 + max(durationMin - 60, 0) / 10), 3, 60)` (one per 6 minutes for the first hour, then one per 10; changed 2026-10-15 so short city trips get about five stops); the route is cut into that many equal stretches
   (Mysuru ≈ 15 slots, Mumbai = 60 slots of ~17 min).
2. **Shortlist per slot:** the top 3 candidates (episodes, POIs, food) anchored in the slot, plus the towns the
   slot passes through.
3. **Empty slot:** relax the filters for that slot only (≥ 50 ratings, ≤ 8 km off route). Still empty: the most
   important town in the slot. Still empty: a `long-form` story about the slot's best `region` article (river,
   district, hills). Otherwise the slot stays empty.
4. **Curator (one Gemini call):** gets the slots with their shortlists, the user's interests and the trip duration,
   and returns for each slot `{ slot, candidateId | null, type, focus }`, plus town-welcome picks. It personalises
   (temples for spirituality, food for food lovers) and prefers unheard places. `type` is story | food |
   town-welcome | episode | long-form.
5. **Code checks every answer (D3):**
   - each pick belongs to its slot's shortlist; a `town-welcome` points at a town, `long-form` at a town or region,
     `episode` at a cluster; `focus` is one of the user's interests or `"general"`;
   - at most one food item per 45 minutes of driving;
   - **spacing:** the next anchor must be at least `targetSeconds(prev) + 60 s` of driving after the previous one
     (`v × seconds`). Anchors: closest approach (story, food), anchor member (episode), 1 km before the town's
     closest approach (town-welcome), start of the slot (long-form). A violation first shortens an episode or
     long-form to a `story`, then drops the lower-scoring item;
   - duplicates removed, sorted by anchor.
6. **Fallback:** if Gemini fails or returns fewer than 3 valid picks, take the top shortlist entry of every slot.
   A trip always gets built.

Then a `trip-intro` item is prepended at `routeDistanceM = 0`.

**Target lengths** (`targetSeconds`): trip-intro 30, town-welcome 40, food 45, story 60, episode 150, long-form 240.

### 5.5 Facts (Wikipedia)
For each place in the chosen items that has no `facts`, or facts older than 90 days:
- Towns, regions and matched POIs already have their article.
- Chosen POIs without a match: one `generator=search` call with `<name> <nearest town>` (top 3, with
  `prop=coordinates|description`). Accept a hit only if it passes the §5.3 rules with a looser **5 km** limit:
  name overlap ≥ 0.5, not junk. Searching by name doesn't depend on where each source put its pin.
- Fetch the plain-text extract (≤ 6 000 chars), save on the place with the page URL (CC BY-SA attribution).
- A POI with no article borrows the nearest town's facts with the instruction to keep the story about the area.
  If neither exists, the item is removed from the trip before writing (never write without facts); `total`
  shrinks accordingly.
- The `trip-intro` has no place: its facts are the trip itself (origin and destination labels, distance, duration,
  towns passed, and the titles of the chosen items).

### 5.6 Write (cache first, then Gemini)
**Cache key:** `v{promptVersion}|{type}|{sorted placeIds}|{language}|{voice}|{focus}|{side}`.
`trip-intro` is per trip and never shared: `v1|trip-intro|{tripId}|{language}|{voice}`.

A cache hit skips writing and narration. On a miss, Gemini (§6.3: flash-lite, flash as fallback) writes
`{ title, script, factsUsed[] }` with:
- RJ persona from spike 2, speaking to people in a car; facts only; no lists or markdown.
- Language guide per language (11 entries, e.g. natural spoken Kannada in Kannada script, Hinglish in Latin
  script).
- **Word budget** = `targetSeconds × wordsPerMinute(language) / 60`. Words per minute: en-IN 190, hi-IN 170,
  hi-en 175, kn-IN 115 (measured); ta-IN 110, te-IN 115, ml-IN 100, mr-IN 140, bn-IN 150, gu-IN 150, pa-IN 170
  (provisional, logged and corrected from real mp3 durations by `build-trip.ts`).
- Side of road for single-place items; no distances (S1); numbers and units spelled out.

**Validation** (deterministic, `pipeline/scriptCheck.ts`):
- No ASCII digits; no "km"/"kms" tokens.
- No letters from an Indic script other than the language's own (Kannada must not contain Telugu, etc.).
  `en-IN` and `hi-en` contain no Indic letters at all. Latin letters are allowed in every language (code-mixing).
- For Indic languages, ≥ 60 % of letters are in the expected script.
- Word count within 60–130 % of the budget.

On failure: one more flash-lite try with the reasons appended to the prompt, then one `gemini-3.8-flash` try,
then the item fails.

### 5.7 Narrate and store
- Split the script on sentence boundaries (`.`, `?`, `!`, `।`, newline) into chunks of ≤ 1 800 chars.
- Each chunk is one job on the **Gnani queue** (§6.2) with background priority: TTS `timbre-v2.5`, mp3, 48 kHz,
  the trip's voice and language. Retry 5xx and 429 with backoff.
- `Buffer.concat` the chunks (verified seam-free in spike 1), measure duration with `music-metadata`
  (moved from devDependencies), upload to `stories/{language}/{storyId}.mp3`, then insert the story document.
- The item becomes `ready` with its **trigger**:
  `leadM = v × 0.3 × durationS`, `trigger.routeDistanceM = max(0, anchor − leadM)`, `trigger.location` = the
  route point at that distance, `radiusM = 400` (trip-intro: 1 000).
- `side` is `none` for trip-intro, town-welcome and long-form, for anchors within 1 km of the route ends, and for
  episodes whose members are on both sides.

## 6. Running the build

### 6.1 Trip builder
- In-process, started from `index.ts`. `POST /trips` calls `builder.start(tripId)`; tests inject a fake.
- Items are produced **in route order** with 2 items in flight (one being written while another is narrated), so
  the first items are ready within about a minute. Progress counters are updated on every item.
- Identical cache keys in flight (two trips on the same road) share one promise. A duplicate-key error on the
  story insert means another process won: read and reuse that story.
- Finish: `status = ready` if ≥ 1 item is ready, else `failed` with `NOTHING_BUILT`. `builtAt` set.
- Failures: a stage error before items exist (Places down, curation and fallback both empty) fails the trip with
  `failure.code` (`DISCOVERY_FAILED`, `NOTHING_BUILT`). An item error marks only that item `failed`.

### 6.2 Gnani queue (`clients/gnaniQueue.ts`)
One in-process queue, **concurrency 1** (Gnani allows one in-flight request per key), two priorities:
`interactive` (live mode, later) before `background`. FIFO within a priority. Jobs are single TTS/STT calls, so an
interactive job waits at most one chunk (~6 s). The queue owns retries so a retrying job keeps its turn.

### 6.3 Gemini models and limits
**Decision (2026-10-10): free tier only. No Pro, no paid plan for now.**
- **Primary model: `gemini-3.5-flash-lite`** (thinking LOW) for the curator and every story. Cheapest and fastest.
- **Fallback: `gemini-3.8-flash`** (thinking LOW), one call, when flash-lite still fails after its retries
  (e.g. 503 "high demand"), returns invalid JSON, or fails the script check twice. Spike 2 saw flash-lite leak
  Telugu letters into Kannada, so the fallback will mostly serve Indic languages.
- `GEMINI_FLASH_LANGUAGES` (default empty) sends chosen languages straight to flash, a config-only switch if
  listening shows flash-lite is poor in a demo language.
- **Limits are per model on the free tier**, so each model has its own requests-per-minute limiter:
  `GEMINI_LITE_RPM` (default 10, to be measured) and `GEMINI_FLASH_RPM` (default 5, measured). Overall
  concurrency `GEMINI_CONCURRENCY` (default 2).
- Retry 429/500/503 with exponential backoff (4 attempts); on a 429 wait for the `retryDelay` Google returns
  instead of guessing. 60 s timeout per call. A trip on the free tier builds slowly instead of failing.

### 6.4 Restart
On startup the builder scans `trips` with `status: building` and resumes each at its `stage`:
`discovering`/`curating` restart those stages; `producing` continues with `pending` items. Finished stories are
cached, so nothing is narrated twice.

### 6.5 External call rules
Every client: timeout, retry with exponential backoff on 5xx/429, typed errors (`UpstreamError { service,
status, retryable }`), zod validation of the parts of responses we read, and logs with trip id and key, never
keys or signed URLs.

## 7. Configuration

New env vars (in `env.ts`, and in `.env.example` with empty values):

| Var | Default | Notes |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | required | Routes + Places (New) |
| `GEMINI_API_KEY` | required | free tier (§6.3) |
| `GNANI_API_KEY` | required | |
| `GEMINI_CONCURRENCY` | 2 | both models together |
| `GEMINI_LITE_RPM` | 10 | flash-lite requests per minute; measure on the free tier |
| `GEMINI_FLASH_RPM` | 5 | flash requests per minute; free tier measured 5 |
| `GEMINI_FLASH_LANGUAGES` | empty | comma-separated language ids that skip flash-lite |
| `TRIPS_PER_DAY` | 10 | per user |
| `MAX_ROUTE_KM` | 1200 | |
| `WIKIPEDIA_USER_AGENT` | `MusafirAI/0.1 (https://github.com/Aryanshettar007/Musafir-AI)` | |

Tests set dummy values; no test calls a real API.

## 8. Module layout

```
backend/src/
  geo/            polyline.ts, route.ts (index, project, sample, pointAt)            pure
  clients/        maps.ts, wikipedia.ts, gemini.ts, gnani.ts, gnaniQueue.ts, limiter.ts, upstream.ts (errors, retry)
  pipeline/       rules.ts (constants), discover.ts, filter.ts, curate.ts, facts.ts,
                  write.ts (prompt + cache key), scriptCheck.ts, narrate.ts (chunk + concat), triggers.ts
  services/       trip.service.ts (create, read, list), listen.service.ts, places.service.ts (autocomplete),
                  tripBuilder.ts (stages, resume, progress)
  models/         place.model.ts, story.model.ts, trip.model.ts, listen.model.ts
  controllers/    trips.controller.ts, listens.controller.ts, places.controller.ts
  routes/         trips.routes.ts, listens.routes.ts, places.routes.ts
backend/scripts/  build-trip.ts, preview-selection.ts
```
`createApp` gains `tripBuilder` and `maps` dependencies (fakes in tests), like `verifyIdToken` and `storage` today.

## 9. Testing

- **Pure units:** polyline decode, projection and side, sampling, point-at-distance; chunking; script check
  (Telugu-in-Kannada, digits, "km", ratios); cache keys; trigger placement; spacing and curator-answer checks;
  match, filter, group and slot rules on **trimmed discovery fixtures** of two routes (ids, names, locations,
  types, counts, Wikipedia descriptions), checking known outcomes:
  - Bengaluru → Mysuru: one Maddur Tiffany's, a Srirangapatna episode, Channapatna and Mandya as towns, the
    Mandya → Srirangapatna stretch filled, nothing from the city edges except prominent places.
  - Bengaluru → Mumbai: Marine Drive matched to "Marine Drive, Mumbai"; Lalbagh not matched to its metro station;
    Ambabai Temple not matched to Kolhapur district; no two neighbouring slots empty; Pune and Mumbai Nearby calls
    split when they hit 20 results.
  Fixtures are made once with `build-trip.ts --save-discovery <file>` (the spike's Mysuru file was overwritten by
  the Mumbai run, so Mysuru is fetched again).
- **Pipeline with fakes:** Maps, Wikipedia, Gemini, Gnani and storage replaced by in-memory fakes; builds a trip
  end to end in mongodb-memory-server and checks route order, progress counts, cache reuse on a second trip,
  per-item failure, curator fallback, resume from `producing` after a simulated restart.
- **Gnani queue:** concurrency 1, interactive before background, retries keep order.
- **Routes:** supertest for every endpoint: auth, validation, ownership (another user's trip is 404),
  `TRIP_IN_PROGRESS`, daily limit, listens idempotency and per-event rejection, signed URLs only on ready items.
- **Tuning without API calls:** `npx tsx scripts/preview-selection.ts <discovery file>` runs match → filter →
  group → slots → fallback pick on a saved discovery and writes a GeoJSON for geojson.io (left/right colours), the
  same loop as the spike's `select-probe.ts` but on product code.
- **Manual end to end:** `npx tsx scripts/build-trip.ts --from "Bengaluru" --to "Mysore Palace" --language kn-IN
  --voice Girish` against real APIs, printing timings, cost counters and real words-per-minute per language.

## 10. Risks and open items

1. **Free-tier Gemini** (decided: no paid plan for now). Measured 2026-10-10 (`spikes/gemini/quota-probe.ts`):
   `gemini-3.8-flash` = **5 requests per minute**, `gemini-3.1-pro` = **0** (unusable). flash-lite's limit is not
   measured yet (Google returned 503 "high demand" first). Daily caps aren't visible from the API
   (https://aistudio.google.com/rate-limit) and may allow only a few new trips a day. Mitigations: the story cache,
   pre-built demo routes (`build-trip.ts`), `TRIPS_PER_DAY`.
2. **flash-lite quality:** spike 2 found it weak in Kannada (Telugu letters, a wrong century, romanised
   Kanglish). The script check catches stray letters and falls back to flash; factual slips are not caught
   automatically. Build the demo routes early and listen in each demo language; use `GEMINI_FLASH_LANGUAGES` where
   needed.
3. **Google caching terms (S4):** confirm before launch that a refreshable snapshot with `fetchedAt` is acceptable;
   if not, drop the snapshot and keep only `googlePlaceId` + our own fields.
4. **Left/right check:** the side computation is not yet verified on a map (`spikes/out/maps/trip.geojson` on
   geojson.io). Do this before recording the demo; a sign error would flip every story.
5. **Words per minute** for 7 languages are guesses until measured.
6. **Build time:** a new Mysuru trip (~16 items) is ~2 min of Gnani time and ~2 min of flash-lite at 10 per
   minute; a new Mumbai trip (60 items) about 6–7 min each, though the first items are ready within a minute.
   Cached routes build in seconds; ask Gnani to raise the concurrency limit.
7. **Places API cost:** long routes need many more calls (Mumbai ≈ 90 Places calls before splits). Check the Maps
   billing free usage before building many long demo routes.
