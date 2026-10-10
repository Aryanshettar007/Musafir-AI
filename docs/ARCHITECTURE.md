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
│  /trips   /trips/:id/pack   /ask   /me   /voices   /places                           │
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
  "voice": "Nalini",
  "route": { "polyline": "encoded…", "distanceM": 145000, "durationS": 10800 },
  "items": [
    {
      "id": "itm_…",
      "type": "story",               // story | city-welcome | food | featured | music-break | trip-intro
      "placeId": "plc_…",
      "title": "Srirangapatna Fort",
      "trigger": {
        "lat": 12.4216, "lng": 76.6930,   // point ON the route where narration should start
        "radiusM": 400,
        "routeDistanceM": 118300           // position along the route, used for ordering + "already passed"
      },
      "side": "right",                    // computed (D3)
      "priority": 80,                     // ranking score; higher wins on conflict
      "audio": { "url": "https://…/stories/plc_…/kn-IN/Nalini/v1.mp3", "durationS": 60, "bytes": 937000 },
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
- **Screens** (from sketch): Login → Onboarding (name, gender, language, interests, narrator voice, music access permission)
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
**Users can pick any of the 42 Gnani voices.** The defaults below only cover users who don't choose one.

- **Picker flow, two steps (gender first, then voice):**
  1. **Choose Male or Female.**
  2. **Choose a voice within that gender.** The list shows only that gender's voices (15 male, 27 female in Timbre
     v2.5). The default for their language (table below) is pre-selected and pinned at the top with a
     "Recommended" tag, followed by the rest. **Every voice has a ▶ "Try" button** that plays a short sample in the
     user's selected language, so they can listen before choosing.
  - Switching gender jumps to that gender's default voice. Picking a voice saves it, and they can try as many as they like.
- **Onboarding** runs this flow. The result is saved as `users.voice` (with `users.voiceGender`), their profile default.

  | Language | Male | Female |
  |---|---|---|
  | English / Hindi / Hinglish | Deepak | Nalini |
  | Kannada | Girish | Nalini |
  | Tamil / Telugu | Girish | Asmita / Lavanya |
  | Malayalam / Marathi / Bengali / Gujarati / Punjabi | Riyaan / Ishaan / Dhruva / Veera / Zayan | Reshma / Zahira / Kirra / Falak / Mehuli |

  English, Hindi and Kannada were chosen by ear after the voice-matrix test: **Deepak, Girish and Nalini** sounded
  best. Kavin and Saanvi were rejected (Saanvi sounded worst). The other languages are provisional (Gnani's own
  voice for that language; Gnani has no male Tamil or Telugu voice) until someone listens to the demos.
  **Languages = exactly the 11 Gnani Timbre v2.5 languages** (`backend/src/catalog/languages.ts`, decided
  2026-10-10). Kanglish is no longer a separate language setting. Spike 1 showed every Gnani voice is intelligible in every language, so this is
  a taste decision and lives in config, not code.
- **Where To?** pre-fills the profile voice and has a "Change voice" option for this trip only. The profile default
  can be changed any time in **Profile**.
- **One shared picker component** runs the same Male/Female → voice → ▶ Try flow in Onboarding, Where To? and
  Profile. Voices not tuned for the selected language get a small "best for <language>" hint, but are never blocked.
- **Backend:** `GET /voices?language=kn-IN&gender=male` returns the catalogue
  `{ name, gender, recommended, demoUrl }[]` from `backend/src/catalog/voices.ts`, with the recommended voice for
  that language and gender first. Demos are pre-generated once per voice × language (42 × 11 short clips,
  `scripts/generate-voice-demos.ts`) and stored in object storage. Requests that take a
  voice (`POST /trips`, `PATCH /me`) validate it against the catalogue.
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

### 5.3 Trip generation pipeline (informed by spikes 1–3)
1. **Route:** Google Routes API, source→destination → polyline, distance, duration.
2. **Discover** (spike 3: about 16 Places calls plus about 15 Wikipedia calls per route, a few seconds in total):
   - **Places Nearby Search** every ~15 km (r ≈ 8 km) for culture, nature and temple types. This gave the best
     recall (10/13 known stops).
   - **Places Text Search along the route** for **food** ("famous local restaurants").
   - **Wikipedia geosearch** for **towns** ("Welcome to Channapatna") and as the fact source. Google doesn't return towns.
   - Featured businesses from our DB.
3. **Pre-filter (deterministic):** ≤ 5 km off route, minimum review count, story/food types, **chain dedupe** (one
   Maddur Tiffany's, not three), **cluster detection** (Srirangapatna = 5 sights within 5 km → one episode), and
   no item inside the first/last ~15 km of city unless it is very prominent. This leaves about 40–60 candidates.
4. **Curate (Gemini, one call):** from the candidates, the user's interests and the trip duration, pick and order the
   episodes: clusters become one longer episode, long empty stretches (e.g. 28 km Mandya → Srirangapatna) become
   long-form regional stories, and towns get welcomes. Target density is about one item per 8–15 min, with
   spacing ≥ 3 min. Geometry (side, distance, trigger point) stays deterministic (D3).
5. **Retrieve facts (RAG):** for each place, fetch Wikipedia/Wikivoyage summary plus Places details plus our
   curated notes. Store them as `place.facts[]` with sources. Embeddings/vector search come later, only if needed:
   per-place retrieval is a keyed lookup, not a search problem.
6. **Write story (Gemini `gemini-3.8-flash`, thinking LOW):** a prompt with facts, language, persona
   ("RJ-style narrator"), side of road, user interests, and a **per-language word budget**. For 60 s that is about
   en 190 / kn 115 / Kanglish 145 / hi 170 / Hinglish 175 words; the model's own duration estimate is useless.
   Output is structured JSON: `{ title, script, factsUsed[] }`. Write numbers as words (Gnani recommendation).
   Validate with the schema (zod), a **Unicode script-range check** (no Telugu characters in Kannada, etc.), and length.
   Kanglish = Kannada script + Latin-script English words, which is what Gnani reads best (spike 2).
   Spell out abbreviations and units ("kilometres", not "km"). Every voice reads "km" wrongly.
7. **Narrate (Gnani TTS):** Timbre v2.5, mp3 at 48 kHz (always 128 kbps, ≈15.6 KB/s). Retry 5xx. About 5–6 s
   per 60 s story (spike 1). Measure the real duration from the mp3 for the pack manifest.
   **Always chunk** the script on sentence boundaries (≤1 800 chars). The REST endpoint fails above about 2 000 chars.
   Narrate chunks in parallel and concatenate the mp3s into one file per story. A 5-minute "episode" took about
   25 s sequentially (spike 1, long-form).
8. **Store:** upload mp3 to object storage, save a `Story` doc (cache key from D2), assemble the pack.

**Runs async:** `POST /trips` creates the trip and returns `202 { tripId, status: "building" }`. The app polls
`GET /trips/:id` (or uses SSE) for progress. Items become playable as they finish, so the first stories can be
ready before the whole pack is. Concurrency is limited per provider. **Gnani allows only ONE in-flight request per
API key**, so all Gnani calls (TTS and STT) go through **one server-side priority queue**: interactive Q&A and
RJ links first, background trip narration after, in ≤1 800-char chunks so an interactive request waits at most one
chunk. A new 40-story trip needs about 4 min of TTS; cached stories (D2) and pre-built demo routes avoid that wait.
Users never supply their own keys. Ask Gnani (hackathon organisers) to raise the limit.

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

### 5.4a Musafir Radio (music between stories)
**Decision (2026-10-10): no music API.** Musafir doesn't stream music. It works with **whatever music app the user
already plays** (JioSaavn, Spotify, YouTube Music, Apple Music, Gaana) through the system media controls, the ones
shown in the notification bar and lock screen. Spotify was dropped: Premium-only control and a 5-user cap for apps
in development mode. Other services have no usable API. Research: `backend/spikes/music/FINDINGS.md`.

**Android (main path):** a native module (Expo development build) uses `MediaSessionManager.getActiveSessions()` with
a `NotificationListenerService`. The user grants **Notification access** once, in onboarding. The app can then:
- read **now playing** (title, artist, album, playing/paused) from any music app
- **pause / play / skip** through that app's `MediaController.TransportControls`

**iOS (fallback):** iOS doesn't let apps read or control other apps' playback. Musafir only **ducks or pauses** other
audio while it speaks (`expo-audio` `interruptionMode: 'duckOthers' | 'doNotMix'`) and uses RJ lines that don't name
songs. Resume behaviour after our audio ends must be checked on a device.

**Flow while driving** (trip player in the app):
```
music playing (any app)        ── next pack item ≥ ~3 min away: let it play
next item approaching (~30 s before trigger) ─▶ pause music app (Android) / duck (iOS)
RJ link (+ "that was <song> by <artist>" on Android) ─▶ story ─▶ resume music
every 2–3 songs in a long gap ─▶ short RJ link over a pause ("you're listening to … — Mandya in twelve minutes")
```

**Backend's part:**
- **Pre-generated generic RJ links in the pack** ("music break!", "back to your music", "next stop in ten
  minutes…"). These work offline. Pack item type `music-break` marks long gaps where music is expected.
- **`POST /rj/link`** `{ tripId, style, nowPlaying?: {title, artist}, nextItemId?, minutesToNext? }` returns
  `{ text, audioUrl }`: an online, song-aware RJ link (Gemini flash-lite + Gnani in the trip voice, ~3 s). Song
  names come from the device, never from a music API. The app falls back to a generic pack link when offline or on
  timeout.
- User setting `musicMode: "rj" | "duck-only" | "off"`.

**Risks to check:** Google Play's policy on the Notification Listener permission (needs a clear in-app disclosure),
and how each music app reacts to external pause/resume (verify on device: JioSaavn, Spotify, YT Music).

### 5.5 Auth
Firebase Auth is set up by the teammate in the app. The backend verifies the Firebase ID token in middleware
(`firebase-admin`, project ID **`musafir-ai-a7114`**; the app uses email/password sign-in only) and upserts a `User` by `firebaseUid`. Profile and
preferences live in MongoDB.

### 5.6 Data model (MongoDB Atlas)
| Collection | Key fields | Notes |
|---|---|---|
| `users` ✅ | firebaseUid (unique), email, name, gender, age, language, voiceGender, voice, interests[], musicMode | `language`/`voice`/`interests` are the **defaults** set at signup. API: `docs/API.md` |
| `voice_demos` ✅ | voice, language (unique together), gender, storageKey, bytes, durationS, text | One "Try" clip per voice × language (42 × 11 = 462), uploaded to B2 by `scripts/upload-voice-demos.ts`. `GET /voices` signs URLs from `storageKey` |
| `places` | googlePlaceId, name, location (GeoJSON, 2dsphere), category, facts[{text, source}], prominence, featured? | Shared cache across trips |
| `stories` | placeId, language, voice, variant, script, audio{url, durationS, bytes}, model versions | Unique index on cache key (D2) |
| `trips` | userId, source, destination, route{polyline,…}, prefs{language, voice, interests[], mood, group}, status, items[], packVersion | `prefs` is a snapshot taken at trip start (profile defaults or per-trip overrides) |
| `businesses` (later) | placeId, plan, pitch, active window, impressions | Revenue: featured discoveries |

### 5.7 Object storage
**Decision (2026-10-10): Backblaze B2.** It is free with no card: 10 GB stored, and downloads free up to 3× the
stored amount per month. It speaks the S3 API, so the code uses the standard AWS SDK and can move to Cloudflare R2
by changing config. Firebase Storage was rejected: it needs the Blaze plan (card, no hard spending cap) and charges
more per download.
- Audio never lives in MongoDB (512 MB free tier, 16 MB document limit) or on the server's disk (wiped on
  redeploy). MongoDB stores only `{ storageKey, bytes, durationS }`.
- The bucket (`Musafir-AI`, region `us-east-005`) is private. The API returns signed URLs valid for 7 days, the S3
  maximum, and signs them fresh on every request. Spike results: `backend/spikes/storage/FINDINGS.md`.
- Keys: `stories/{placeId}/{lang}/{voice}/{side}.mp3`, `voice-demos/{lang}/{Voice}.mp3`.
- All access goes through `clients/storage.ts`, with a local-folder driver for development and the S3 driver in
  production, chosen by env config.
- The app downloads a trip's audio to the phone before the drive (offline playback).

### 5.8 Hosting 🔬 (needs a decision)
The sketch says "Express on Cloudflare". Caveat: Cloudflare Workers is not a normal Node server. Express plus
Mongoose (raw TCP to Atlas) plus long-running trip-build jobs may not run there without changes. Options to
verify in a short hosting spike:
- **A (recommended for speed):** Express on a Node host (Render / Railway / Fly.io / Google Cloud Run),
  Backblaze B2 for audio (§5.7).
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
| **3b. Musafir Radio** | Android media-session module (app), generic RJ links in packs + `/rj/link` (backend) | JioSaavn/YT Music plays, Musafir pauses it for a story and names the song |
| Later | Featured businesses, group/mood modes, voice cloning, creator story packs, state tourism | Pitch slides |

**Demo-video tip:** a "simulated drive" mode that replays a recorded GPS track at 10–20× speed makes the
video easy to shoot and reliable. Build it as part of slice 2.

## 8. Open questions
1. **Hosting:** Express on a Node host + R2 (A) vs Cloudflare Workers (B)? → hosting spike.
2. **Evon:** not in Gnani's docs. Is it a separate hackathon API? If it's an LLM, compare it against Gemini.
3. ~~Places source quality~~ → resolved in spike 3: use Places Nearby + Text Search (food) + Wikipedia (towns, facts).
   Still open: **Google Maps Platform caching terms** (store `place_id`, not Places content; build packs from our
   own Wikipedia-sourced content), and verifying left/right on a map (`out/maps/trip.geojson`).
4. ~~Gemini model choice~~ → resolved in spike 2: flash for stories, flash-lite for Q&A.
   Still open: behaviour for small places with thin Wikipedia pages, and cost per trip pack.
5. ~~Story language style~~ → the language setting is one of Gnani's 11 codes. Whether Kannada stories mix in
   English words (Kanglish read well in spike 2) is a writing-style choice inside the story prompt, not a setting.
6. **Offline map tiles:** is audio-only offline enough for v1 (recommended), or do we need an offline map?
7. **Real-world STT in a noisy car:** record and test (see spike 1 "Not yet tested").

## 9. Spike status
| Spike | Status | Key result |
|---|---|---|
| Gnani TTS/STT | ✅ Done | All target languages work; ~10× real time; mp3 48 kHz @128 kbps (~37 MB / 40-story pack); STT ≤30 s; retry 5xx. See `backend/spikes/gnani/FINDINGS.md` |
| Gemini | ✅ Done | flash writes excellent grounded stories in all 5 styles; flash-lite breaks Kannada but is fast for Q&A (~3.5 s end to end); quota is the main risk. See `backend/spikes/gemini/FINDINGS.md` |
| Google Maps (Routes + Places) | ✅ Done | Route in 0.5 s; Nearby Search best recall (10/13), Text Search best for food, Wikipedia needed for towns; a simple ranking already gives a decent 19-item trip. Needs chain dedupe, clustering and a Gemini curator. See `backend/spikes/maps/FINDINGS.md` |
| Music | ✅ Decided | No music API (Spotify: Premium + 5 users; JioSaavn/Gaana/Wynk/YT Music: no usable API). Control the user's own music app through Android media sessions; duck on iOS. See `backend/spikes/music/FINDINGS.md` |
| Auth (Firebase) | ✅ Teammate | Done in the app; backend only verifies ID tokens |
| Storage (Backblaze B2) | ✅ Done | Private bucket via S3 API works from India: upload ~0.5 s, ~270 ms to first byte, presigned URLs (max 7 days), range requests OK. B2 keeps old versions on overwrite/delete. See `backend/spikes/storage/FINDINGS.md` |
| Hosting | ⏳ | |
