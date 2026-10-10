# Musafir-AI — Architecture Plan

> **Status: Draft v0.2 (2026-10-10), for review.** Built from the idea write-up, the sketches in `reference/`,
> spike 1 (Gnani) and spike 2 (Gemini). Sections marked 🔬 depend on spikes not yet run (Gemini, Maps, auth, hosting) and will be
> revised once those findings land. Each build slice still gets its own spec → plan → implementation.

---

## 1. Product in one paragraph

**"Google Maps tells you where you are. Musafir tells you the story of where you are."**
The user picks a source and destination, a language and a narrator voice, and starts driving. The app follows
GPS and automatically plays short audio stories as they approach interesting places: forts, towns, temples, food
spots, featured local businesses. They can ask questions by voice ("What is this fort famous for?",
"Where should we stop for food?"). A whole trip can be downloaded beforehand and works with no internet.

**Hackathon deliverables:** codebase, video demo, one hosted deployment.
**Judging angle:** voice is the product. Show Indian languages, code-mixed speech, a noisy driving environment,
offline mode, and culturally grounded content.

## 2. Guiding decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Trip Pack model.** The server pre-generates a whole trip as a manifest of geo-triggered audio items. The app is a GPS-triggered player of cached content. | Online and offline become the *same* architecture: offline is just "download the pack fully before leaving". There's no generation latency while driving, and it works in dead zones. |
| D2 | **Stories are cached per place, not per trip.** A story is keyed by `(placeId, language, voice, storyVariant)`. | Bengaluru→Mysuru and Bengaluru→Coorg share many places. Popular routes become nearly free, and packs build in seconds once warm. |
| D3 | **Deterministic geometry, generative prose.** Side of road, distance, and trigger timing are computed in code. Gemini only writes the words. | LLMs are unreliable at geometry. "On your left" must be correct. |
| D4 | **RAG-grounded stories.** Gemini writes from retrieved facts (Wikipedia/Wikivoyage/Places data + curated notes) and must not invent facts. | Reliability and a strong judging point. |
| D5 | **All third-party keys stay on the server.** The app only talks to our API. | Security; lets us swap providers. |
| D6 | **Build in vertical slices**, each demo-able end to end. | Hackathon risk management: something always works. |

## 3. System overview

```
┌──────────────────────── Mobile app (Expo / React Native) ─────────────────────────┐
│  Onboarding · Where-To · Trip view/map · Player · Voice-ask button · Profile       │
│                                                                                     │
│  ┌─────────────┐   ┌──────────────────┐   ┌───────────────┐   ┌────────────────┐   │
│  │ Location    │──▶│ Trigger engine   │──▶│ Audio player  │   │ Pack store     │   │
│  │ (bg GPS)    │   │ (geofence, queue,│   │ (queue, duck, │◀──│ (manifest +    │   │
│  └─────────────┘   │  heard-history)  │   │  interrupt)   │   │  mp3 on disk)  │   │
│                    └──────────────────┘   └───────────────┘   └────────────────┘   │
└───────────────┬───────────────────────────────────────────────────────▲────────────┘
                │ HTTPS (Firebase ID token)                              │ pack + audio
┌───────────────▼────────────────────── Backend (Express + TS) ─────────┴────────────┐
│  /trips   /trips/:id/pack   /ask   /me   /places                                     │
│                                                                                     │
│  Trip pipeline:  Route ─▶ Discover places ─▶ Rank ─▶ Retrieve facts ─▶ Write story │
│                  (Maps)    (Maps Places)     (interests) (RAG)        (Gemini)       │
│                                                       ─▶ Narrate (Gnani TTS) ─▶ Store │
│  Ask pipeline:   audio ─▶ Gnani STT ─▶ Gemini (+trip context, RAG) ─▶ Gnani TTS ─▶ mp3 │
└──────┬──────────────┬───────────────┬────────────────┬───────────────┬─────────────┘
       │              │               │                │               │
  MongoDB Atlas   Object storage   Google Maps     Gemini API     Gnani Vachana
  (users, places, (audio mp3s,     (Routes,        (story/answer  (Prisma STT,
   stories, trips) e.g. R2)         Places)         writing)       Timbre TTS)
                                                                    Firebase Auth
```

## 4. Core concept: the Trip Pack

A trip pack is a manifest plus audio files. The app needs nothing else to run a trip offline.

```jsonc
// GET /trips/:id/pack
{
  "tripId": "trp_…",
  "version": 3,
  "language": "kn-IN",
  "voice": "Saanvi",
  "route": { "polyline": "encoded…", "distanceM": 145000, "durationS": 10800 },
  "items": [
    {
      "id": "itm_…",
      "type": "story",               // story | city-welcome | food | featured | song-info | trip-intro
      "placeId": "plc_…",
      "title": "Srirangapatna Fort",
      "trigger": {
        "lat": 12.4216, "lng": 76.6930,   // point ON the route where narration should start
        "radiusM": 400,
        "routeDistanceM": 118300           // position along the route, used for ordering + "already passed"
      },
      "side": "right",                    // computed (D3)
      "priority": 80,                     // ranking score; higher wins on conflict
      "audio": { "url": "https://…/stories/plc_…/kn-IN/Saanvi/v1.mp3", "durationS": 60, "bytes": 937000 },
      "transcript": "…"                   // for captions / accessibility / debugging
    }
  ],
  "totalBytes": 37500000
}
```

**Trigger point ≠ place location.** For a place 2 km off the highway, the trigger is placed *on the route*,
before the closest-approach point, with lead distance ≈ `speed × (audioDuration × 0.3)`. That way the story
is mid-way when the place is nearest. The backend computes a default; the app adjusts with live speed.

## 5. Components

### 5.1 Mobile app (teammate, `App/`)
- **Screens** (from sketch): Login → Onboarding (name, gender, language, interests, connect Spotify/Maps later)
  → Tabs: **Home / Where To?** (source + destination; language, voice and interests
  pre-filled from the profile but changeable for this trip; solo/group, mood, recent trips), **Trip**
  (map + now-playing + upcoming), **Profile**.
- **Location:** `expo-location` with background updates via `expo-task-manager`. Needs a development build,
  not Expo Go. 🔬 Verify the Expo SDK API in the versioned docs (see `App/AGENTS.md`).
- **Trigger engine** (pure TS, unit-testable). Each GPS fix:
  1. Snap to route → current `routeDistanceM`.
  2. Find items whose trigger zone is entered and that haven't been played or skipped.
  3. Enqueue by priority. Never overlap; drop low-priority items that are already behind the car.
  4. Record "heard" so the same place isn't replayed on a return trip.
- **Audio player:** queue, pause/skip, ducking for navigation prompts, and interruption by voice Q&A.
- **Pack store:** download manifest + mp3s to the device file system, report progress, resume, verify bytes.
  Playback always reads local files when present and streams from URLs otherwise.
- **Voice ask:** push-to-talk button. Record ≤25 s (Gnani STT limit is 30 s), upload to `/ask`, play the reply.
- **Design rules:** light/dark only, no purple/blue, no text chatbot.

### 5.1a Narrator voice selection
- **Onboarding** asks narrator gender (M/F). Together with the language, that picks a default voice:

  | Language | Male | Female |
  |---|---|---|
  | Kannada / Kanglish | Kavin | Nalini |
  | English | Girish | Nalini |
  | Hindi / Hinglish | Deepak | Nalini |

  This is the user's choice (Kavin/Girish male, Nalini female). Spike 1 showed every Gnani voice is intelligible in
  every language, so the table is a taste decision and lives in config, not code.
- **Where To?** shows the chosen voice with "Change voice". The picker lists recommended voices for the language
  first, then all 42 Timbre voices, each with a ▶ preview. Previews are pre-generated once as static mp3s.
- **Voice is fixed per trip:** the pack audio is rendered in that voice. Changing it is free before the trip starts;
  mid-trip it applies only to newly generated content (or needs a re-download).
- **Voice Q&A replies use the trip's voice**, so it feels like one narrator.
- The Gnani API has no "prompt": the voice is chosen with the `voice` + `language` (+ `speed`) parameters, and
  tone/personality come from the Gemini-written script.

### 5.2 Backend API (Aryan, `backend/`)
Layering: `routes → controllers → services → clients`, config in one validated module.

```
backend/src/
  config/        env.ts (zod-validated env), db.ts
  clients/       gnani.ts, gemini.ts, maps.ts, storage.ts, firebase.ts   ← one per external API
  services/      route.service.ts, discovery.service.ts, ranking.service.ts,
                 facts.service.ts (RAG), story.service.ts, narration.service.ts,
                 tripPack.service.ts, ask.service.ts
  geo/           polyline, distance, bearing, side-of-road, trigger placement (pure functions)
  models/        user, place, story, trip (Mongoose)
  routes/        trips.routes.ts, ask.routes.ts, me.routes.ts
  middleware/    auth (verify Firebase ID token), validate (zod), error handler, rate limit
  jobs/          tripBuild.job.ts (async pack generation)
```

### 5.3 Trip generation pipeline 🔬 (Maps + Gemini spikes)
1. **Route:** Google Routes API, source→destination → polyline, distance, duration.
2. **Discover:** find candidate places near the route. Options to compare in the Maps spike: Places API (New)
   Text Search with search-along-route, or Nearby Search at sampled points every ~5–10 km. Categories: historic
   sites, landmarks, temples, towns/cities, nature, notable food, featured businesses (from our DB).
3. **Rank & thin:** score = interest match × prominence (rating, review count, Wikipedia presence) × proximity
   to route. Enforce spacing (no two stories within ~2–3 min of driving) and a target density (e.g. one per
   8–15 min). Always include city/town welcomes.
4. **Retrieve facts (RAG):** for each place, fetch Wikipedia/Wikivoyage summary plus Places details plus our
   curated notes. Store them as `place.facts[]` with sources. Embeddings/vector search come later, only if needed:
   per-place retrieval is a keyed lookup, not a search problem.
5. **Write story (Gemini `gemini-3.8-flash`, thinking LOW):** a prompt with facts, language, persona
   ("RJ-style narrator"), side of road, user interests, and a **per-language word budget**. For 60 s that is about
   en 190 / kn 115 / Kanglish 145 / hi 170 / Hinglish 175 words; the model's own duration estimate is useless.
   Output is structured JSON: `{ title, script, factsUsed[] }`. Write numbers as words (Gnani recommendation).
   Validate with the schema (zod), a **Unicode script-range check** (no Telugu characters in Kannada, etc.), and length.
   Kanglish = Kannada script + Latin-script English words, which is what Gnani reads best (spike 2).
   Spell out abbreviations and units ("kilometres", not "km"). Every voice reads "km" wrongly.
6. **Narrate (Gnani TTS):** Timbre v2.5, mp3 at 48 kHz (always 128 kbps, ≈15.6 KB/s). Retry 5xx. About 5–6 s
   per 60 s story (spike 1). Measure the real duration from the mp3 for the pack manifest.
   **Always chunk** the script on sentence boundaries (≤1 800 chars). The REST endpoint fails above about 2 000 chars.
   Narrate chunks in parallel and concatenate the mp3s into one file per story. A 5-minute "episode" took about
   25 s sequentially (spike 1, long-form).
7. **Store:** upload mp3 to object storage, save a `Story` doc (cache key from D2), assemble the pack.

**Runs async:** `POST /trips` creates the trip and returns `202 { tripId, status: "building" }`. The app polls
`GET /trips/:id` (or uses SSE) for progress. Items become playable as they finish, so the first stories can be
ready before the whole pack is. Concurrency is limited per provider (e.g. 4 Gemini + 4 Gnani in flight).

### 5.4 Voice Q&A
`POST /ask` (multipart: audio, tripId, lat, lng, heading, language):
STT (Prisma, user's language code) → build context (current position, the next/previous few pack items, nearby
places, facts) → Gemini answer (short, spoken style, ≤3 sentences) → TTS → return `{ transcript, answerText, audioUrl }`.
- **Model: `gemini-3.5-flash-lite`** (thinking MINIMAL). It answers in 1.1–1.5 s, versus 2.7–9.7 s for flash.
  Kannada-script answers go through the same script check, with a fallback to flash.
- Measured budget: STT ~0.5 s + LLM ~1.3 s + TTS ~1.7 s ≈ **3.5 s**. If that feels slow, stream the reply
  (Gemini streaming + Gnani SSE TTS).
- The answer schema includes `missingData` (`none | nearby_places | route_info | general_knowledge`). When it is
  `nearby_places`, the server fetches places from Maps and asks again, so the model never guesses restaurants
  (verified in spike 2).
**Offline:** Q&A needs the network. When offline, the app plays a pre-generated "I'll answer once we're back in
coverage" clip, and can still answer "what's next?" from the local pack.

### 5.5 Auth 🔬
Firebase Auth (email/password) on the client. The backend verifies the Firebase ID token in middleware
(`firebase-admin`) and upserts a `User` by `firebaseUid`. Profile and preferences live in MongoDB.

### 5.6 Data model (MongoDB Atlas)
| Collection | Key fields | Notes |
|---|---|---|
| `users` | firebaseUid, name, gender, language, voice, interests[], heardPlaceIds[] | `language`/`voice`/`interests` are the **defaults** set at signup |
| `places` | googlePlaceId, name, location (GeoJSON, 2dsphere), category, facts[{text, source}], prominence, featured? | Shared cache across trips |
| `stories` | placeId, language, voice, variant, script, audio{url, durationS, bytes}, model versions | Unique index on cache key (D2) |
| `trips` | userId, source, destination, route{polyline,…}, prefs{language, voice, interests[], mood, group}, status, items[], packVersion | `prefs` is a snapshot taken at trip start (profile defaults or per-trip overrides) |
| `businesses` (later) | placeId, plan, pitch, active window, impressions | Revenue: featured discoveries |

### 5.7 Object storage
Audio must not live in MongoDB. Use an S3-compatible bucket (Cloudflare R2 fits the Cloudflare plan) with
public-read or signed URLs, keyed `stories/{placeId}/{lang}/{voice}/{variant}.mp3`.

### 5.8 Hosting 🔬 (needs a decision)
The sketch says "Express on Cloudflare". Caveat: Cloudflare Workers is not a normal Node server. Express plus
Mongoose (raw TCP to Atlas) plus long-running trip-build jobs may not run there without changes. Options to
verify in a short hosting spike:
- **A (recommended for speed):** Express on a Node host (Render / Railway / Fly.io / Google Cloud Run),
  Cloudflare R2 for audio, Cloudflare DNS/CDN in front.
- **B:** Cloudflare Workers + Hono instead of Express, Atlas via its HTTP Data API or a driver that works on
  Workers, Queues for trip builds. More moving parts.

## 6. Cross-cutting concerns
- **Errors:** typed errors per client (`GnaniError`, `GeminiError`, …) mapped to `{ success:false, error:{code,message} }`.
  Pipeline steps are idempotent and retryable per item, so one failed story doesn't fail the trip.
- **Resilience:** timeouts on every external call, exponential backoff on 5xx/429, per-provider concurrency limits.
  Both Gnani (500 "technical difficulties") and Gemini (503 "high demand", 429 quota) fail transiently in practice.
- **Quota:** a billing-enabled Gemini key is required before slice 1. The current key hits 429 after about 15 calls.
- **Cost control:** story cache (D2), cap items per trip, and rate-limit `/trips` and `/ask` per user.
- **Observability:** structured logs with `tripId`/`requestId`, and per-step timing (useful for the demo too).
- **Security:** keys server-side only, Firebase token verification, request validation (zod), CORS restricted
  in production, no PII in logs.
- **Testing:** unit tests for `geo/` and ranking (pure functions, high value), service tests with mocked
  clients, and one end-to-end "build Bengaluru→Mysuru pack" smoke test against real APIs (manual / opt-in).

## 7. Roadmap (vertical slices)

| Slice | Goal | Demo moment |
|---|---|---|
| **0. Spikes** | Gnani ✅, Gemini, Maps, auth, hosting | Findings notes in `backend/spikes/*/FINDINGS.md` |
| **1. Trip pack, end to end** | Route → places → facts → Gemini story → Gnani audio → pack JSON for one real route | `curl` a pack, play stories in Kannada/English |
| **2. Drive mode** (app) | Download pack, background GPS, trigger engine, player | Simulated drive plays stories at the right spots |
| **3. Voice Q&A** | `/ask` STT→Gemini→TTS with trip context | "ಈ fort ಯಾಕೆ famous?" answered aloud |
| **4. Accounts & onboarding** | Firebase auth, profile, interests, language, voice | Personalised stories differ by interest |
| **5. Offline polish** | Full pre-download, resume, storage mgmt, offline fallbacks | Airplane-mode drive in the video |
| **6. Hosting & demo** | Deploy, seed popular routes, record video | Hosted link + video |
| Later | Featured businesses, local music/song-info, group/mood modes, Spotify, voice cloning, creator story packs, state tourism | Pitch slides |

**Demo-video tip:** a "simulated drive" mode that replays a recorded GPS track at 10–20× speed makes the
video easy to shoot and reliable. Build it as part of slice 2.

## 8. Open questions
1. **Hosting:** Express on a Node host + R2 (A) vs Cloudflare Workers (B)? → hosting spike.
2. **Evon:** not in Gnani's docs. Is it a separate hackathon API? If it's an LLM, compare it against Gemini.
3. **Places source quality:** does Google Places surface good *historic/cultural* spots along Indian highways, or
   do we need Wikipedia geosearch / a curated seed list for the demo routes? → Maps spike.
4. ~~Gemini model choice~~ → resolved in spike 2: flash for stories, flash-lite for Q&A.
   Still open: behaviour for small places with thin Wikipedia pages, and cost per trip pack.
5. **Story language style:** pure Kannada vs Kanglish by default? Probably a user setting ("Mixed / Pure").
6. **Offline map tiles:** is audio-only offline enough for v1 (recommended), or do we need an offline map?
7. **Real-world STT in a noisy car:** record and test (see spike 1 "Not yet tested").

## 9. Spike status
| Spike | Status | Key result |
|---|---|---|
| Gnani TTS/STT | ✅ Done | All target languages work; ~10× real time; mp3 48 kHz @128 kbps (~37 MB / 40-story pack); STT ≤30 s; retry 5xx. See `backend/spikes/gnani/FINDINGS.md` |
| Gemini | ✅ Done | flash writes excellent grounded stories in all 5 styles; flash-lite breaks Kannada but is fast for Q&A (~3.5 s end to end); quota is the main risk. See `backend/spikes/gemini/FINDINGS.md` |
| Google Maps (Routes + Places) | ⏳ | |
| Auth (Firebase) | ⏳ | |
| Hosting | ⏳ | |
