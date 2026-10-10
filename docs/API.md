# Musafir-AI backend API

For the app (screen-by-screen guide: [`FRONTEND_GUIDE.md`](FRONTEND_GUIDE.md)). Base URL in development: `http://<your PC's LAN IP>:3000` (a phone can't reach `localhost` on the PC).

## Conventions
- JSON in, JSON out.
  - Success: `{ "success": true, "data": … }`
  - Error: `{ "success": false, "error": { "code": "…", "message": "…", "details"?: … } }`. `details` is a list of
    `{ path, message }` for `VALIDATION_FAILED`, and an object for some codes (e.g. `{ tripId }` on `TRIP_IN_PROGRESS`).
  - Use `error.code` in the app and show `message` only for debugging.
- **Auth: every endpoint except `GET /health` needs the Firebase ID token.** Sign-up and login don't go through
  this API; the app talks to Firebase directly and then sends the token:
  ```ts
  const token = await auth.currentUser!.getIdToken(); // the SDK refreshes it automatically
  fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
  ```
  A missing, invalid or expired token returns `401 UNAUTHORIZED`. Voice demo clips (`demoUrl`) are plain files and
  need no header.

## Onboarding

### 🔒 `GET /catalog`
The options for the onboarding pickers. Languages are exactly the ones Gnani narrates. **Read these instead of hardcoding lists in the app.** The backend
validates against exactly these IDs.
```json
{
  "genders":    [{ "id": "male", "label": "Male" }, { "id": "female", "label": "Female" }, { "id": "unspecified", "label": "Prefer not to say" }],
  "languages":  [{ "id": "en-IN", "label": "English" }, { "id": "hi-IN", "label": "Hindi" }, { "id": "hi-en", "label": "Hinglish (Hindi + English)" },
                 { "id": "kn-IN", "label": "Kannada" }, { "id": "ta-IN", "label": "Tamil" }, { "id": "te-IN", "label": "Telugu" },
                 { "id": "ml-IN", "label": "Malayalam" }, { "id": "mr-IN", "label": "Marathi" }, { "id": "bn-IN", "label": "Bengali" },
                 { "id": "gu-IN", "label": "Gujarati" }, { "id": "pa-IN", "label": "Punjabi" }],
  "interests":  [{ "id": "history", "label": "History & Heritage" }, { "id": "architecture", "label": "Forts & Architecture" },
                 { "id": "spirituality", "label": "Temples & Spirituality" }, { "id": "food", "label": "Food & Local Eats" },
                 { "id": "nature", "label": "Nature & Wildlife" }, { "id": "adventure", "label": "Adventure & Trekking" },
                 { "id": "art-culture", "label": "Art, Crafts & Museums" }, { "id": "legends", "label": "Myths & Legends" },
                 { "id": "cinema", "label": "Cinema & Pop Culture" }],
  "musicModes": [{ "id": "rj", "label": "Radio host between songs" }, { "id": "duck-only", "label": "Just lower my music during stories" },
                 { "id": "off", "label": "No music handling" }],
  "defaults":   { "language": "en-IN", "interests": ["history", "food"], "musicMode": "rj" }
}
```

### 🔒 `GET /voices?language=<id>&gender=male|female`
Narrator voices for the voice picker (first choose Male/Female, then a voice). `language` is required and `gender` is
optional. Recommended voices come first.
```json
[
  { "name": "Girish", "gender": "male", "recommended": true,  "demoUrl": "https://…/kn-IN/Girish.mp3" },
  { "name": "Deepak", "gender": "male", "recommended": false, "demoUrl": "https://…/kn-IN/Deepak.mp3" }
]
```
Play `demoUrl` for the "Try" button. It is a **signed link that expires after 7 days**, so fetch `/voices` when the
picker opens and don't save the links. `demoUrl` is `null` if that clip hasn't been uploaded yet.

### 🔒 `GET /me`
The user's profile. **`404 PROFILE_NOT_FOUND` means onboarding isn't done**, so show the onboarding screen.
After login: `200` → home, `404` → onboarding.

### 🔒 `PUT /me`
Submit onboarding. **Every field is optional.** Missing fields get defaults, so "Skip for now" sends `{}`.
Returns `201` the first time and `200` after that. Sending it again replaces the whole profile.
```json
{
  "name": "Aryan",
  "gender": "male",
  "age": 22,
  "language": "kn-IN",
  "voiceGender": "male",
  "voice": "Girish",
  "interests": ["history", "food"],
  "musicMode": "rj"
}
```
- `age` is a **number**, not a string: send `Number(age)`, or leave it out if empty.
- `voice` alone is enough, because `voiceGender` follows from it. `voiceGender` alone picks the recommended voice.
  Neither one: the recommended voice matching the user's gender (or male for "unspecified").
- Unknown fields are rejected (`400 VALIDATION_FAILED`). For example, don't send a Spotify flag.

Response (`data`): the stored profile, i.e. the fields above plus `email`, `createdAt`, `updatedAt`.

### 🔒 `PATCH /me`
Change settings later. Send only what changed, e.g. `{ "language": "kn-IN" }`. If the user still had the default voice,
it moves to the new language's default (Deepak → Girish for Kannada). A voice they picked themselves is kept.
Returns `404 PROFILE_NOT_FOUND` before onboarding.

## Trips (offline trip packs)

The server builds a **trip pack**: an ordered list of audio items (stories, town welcomes, food stops, longer
episodes, and sometimes one sponsored ad) narrated in the user's language and voice. The app starts a trip, polls it,
downloads the audio of items as they become `ready`, and plays them offline by GPS.

Flow: `GET /places/autocomplete` (pick a destination) → `POST /trips` → poll `GET /trips/:id` every 3–5 s while
`status` is `building` → download each `ready` item's `audio.url` → play when the phone enters `trigger`.

### 🔒 `GET /places/autocomplete?q=&lat=&lng=&sessionToken=`
Destination search box. India only. Send `lat` and `lng` (together) to bias results towards the user.
- `q`: 2–100 characters. `sessionToken`: optional UUID the app generates once per search session (Google bills a whole
  session as one request when the chosen place is then used for the trip).
```json
{ "suggestions": [ { "placeId": "ChIJ…", "primaryText": "Mysore Palace", "secondaryText": "Sayyaji Rao Rd, Mysuru, Karnataka" } ] }
```
At most 5 suggestions. Errors: `VALIDATION_FAILED` 400, `UPSTREAM_UNAVAILABLE` 502.

### 🔒 `POST /trips`
```jsonc
{
  "origin": { "lat": 12.97, "lng": 77.59, "label": "Current location" },   // or { "placeId": "ChIJ…", "label": "Bengaluru" }
  "destination": { "placeId": "ChIJ…", "label": "Mysore Palace" },
  "prefs": { "language": "kn-IN", "voice": "Girish", "interests": ["history", "food"] }   // optional, every field optional
}
```
- `origin.label` is optional for coordinates (defaults to `"Current location"`); `destination.label` is required.
- `prefs` accepts `language`, `voiceGender`, `voice`, `interests`, `musicMode` and is applied on top of the user's
  profile by the same rules as `PATCH /me` (voice defaults, gender checks, the same errors). It affects this trip only;
  the profile is not changed. Unknown fields are rejected.
- The route is computed before the response, so routing problems come back immediately.
- `202`: `{ "tripId": "…", "status": "building" }`.

| Code | Status | When |
|---|---|---|
| `PROFILE_NOT_FOUND` | 404 | No profile yet. Show onboarding. |
| `TRIP_IN_PROGRESS` | 409 | The user already has a trip being built. `error.details.tripId` is that trip: resume polling it. |
| `TRIP_LIMIT_REACHED` | 429 | More than 10 trips in the last 24 hours. |
| `ROUTE_NOT_FOUND` | 422 | Google found no drivable route. |
| `ROUTE_TOO_LONG` | 422 | Longer than 1 200 km. |
| `VALIDATION_FAILED`, `UNKNOWN_VOICE`, `VOICE_GENDER_MISMATCH` | 400 | As for `/me`. |
| `UPSTREAM_UNAVAILABLE` | 502 | Routing service down. Try again shortly. |

### 🔒 `GET /trips/:id`
Only the trip's owner can read it; anyone else (and any unknown id) gets `404 TRIP_NOT_FOUND`.
```jsonc
{
  "id": "…", "status": "building",                 // building | ready | failed
  "progress": { "ready": 12, "failed": 1, "total": 31 },
  "origin": { "label": "Current location", "lat": 12.97, "lng": 77.59 },
  "destination": { "label": "Mysore Palace", "lat": 12.30, "lng": 76.65 },
  "prefs": { "language": "kn-IN", "voice": "Girish", "voiceGender": "male", "interests": ["history", "food"], "musicMode": "rj" },
  "route": { "polyline": "encoded…", "distanceM": 138500, "durationS": 9060 },
  "items": [
    {
      "id": "…", "type": "story", "status": "ready",      // type: trip-intro | story | food | town-welcome | episode | long-form | sponsored
      "title": "ಶ್ರೀರಂಗಪಟ್ಟಣ ಕೋಟೆ", "side": "right",       // side: left | right | none
      "trigger": { "lat": 12.42, "lng": 76.69, "radiusM": 400, "routeDistanceM": 118300 },
      "audio": { "url": "https://…?X-Amz-Signature=…", "durationS": 61.2, "bytes": 955000 },
      "transcript": "…"
    }
  ],
  "totalBytes": 37500000,
  "createdAt": "…", "builtAt": "…"
}
```
- `items` are in route order (`trigger.routeDistanceM`, which for items not yet ready falls back to where the item
  is "about"). Play an item when the phone is inside `trigger` (a circle of `radiusM` metres around `lat`, `lng`).
- `audio`, `transcript` and `trigger` are present only when the item is `ready`. `pending` items are still being
  produced; `failed` items stay listed so the app can skip them.
- `status: "ready"` means building has finished and at least one place item is ready (the trip intro and a sponsored
  item alone don't count). `status: "failed"` carries
  `failure: { code, message }` (`NOTHING_BUILT`, `DISCOVERY_FAILED`, `BUILD_FAILED`). Stop polling on `ready` or `failed`.
- `side` is where the place is relative to the direction of travel; `none` for items about a town, a stretch of road
  or places on both sides. The narration may say "on your left/right".
- **A `sponsored` item carries `sponsor: { "name": "Corner House" }`.** Show that label ("Sponsored · Corner House")
  next to the title. There is at most one per trip.
- `totalBytes` is the size of all `ready` items' audio, for a "download X MB" prompt.
- **Audio URLs are signed and expire after 7 days, and a fresh set is signed on every call.** Store the `tripId` and the
  item ids, never URLs. If a download returns 403, call `GET /trips/:id` again and use the new URL.

### 🔒 `GET /trips?limit=20`
The user's trips, newest first (`limit` 1–50, default 20). Summaries only, no items and no URLs:
```json
[ { "id": "…", "status": "ready", "progress": { "ready": 31, "failed": 0, "total": 31 },
    "origin": { "label": "Bengaluru" }, "destination": { "label": "Mysore Palace" },
    "route": { "distanceM": 138500, "durationS": 9060 }, "createdAt": "…" } ]
```

### 🔒 `POST /listens`
What the user listened to. The phone queues events while offline and sends them in batches.
```jsonc
{ "events": [ { "id": "uuid-made-on-the-phone", "tripId": "…", "itemId": "…", "event": "completed", "at": "2026-10-10T08:15:00Z" } ] }
```
- `event`: `started | completed | skipped`. 1–200 events per call. `at` is an ISO timestamp with a time zone.
- **Idempotent:** `id` is unique per user, so resending a batch is harmless (the first event with an `id` wins).
- Events for a trip or item the user doesn't own are rejected one by one; the rest are stored:
  `200 { "accepted": 40, "rejected": [ { "id": "…", "code": "TRIP_NOT_FOUND" } ] }`
  (`code` is `TRIP_NOT_FOUND` or `ITEM_NOT_FOUND`).
- Places the user `completed` are ranked lower the next time a trip is planned, so they hear new things.
- Errors: `VALIDATION_FAILED` 400 for a malformed batch (nothing is stored).

### Sponsored items (sample sponsored slot)
Demo sponsor: Corner House Ice Creams on Bengaluru → Mysuru. Corner House has no deal with Musafir; in the demo and
the pitch this is a sample slot showing how a local business would appear.

A sponsored message is a normal trip item in `GET /trips/:id` (same shape as a story, see the trip spec §3), with
`type: "sponsored"` and a `sponsor` object:

```jsonc
{
  "id": "…", "type": "sponsored", "status": "ready",
  "title": "…", "side": "right",                      // left | right | none
  "sponsor": { "name": "Corner House Ice Creams" },
  "trigger": { "lat": 12.33, "lng": 76.64, "radiusM": 600, "routeDistanceM": 137100 },
  "audio": { "url": "https://…?X-Amz-Signature=…", "durationS": 19.4, "bytes": 303000 },
  "transcript": "…"
}
```

- Play it with the existing trigger engine, like any story. It is `ready` from the start (the ad is pre-generated)
  and sits in route order like every item.
- When `type === "sponsored"`, show a clear **"Sponsored"** label (and `sponsor.name`) in the player. The audio itself
  also opens with a spoken "sponsored message" cue in the trip language.
- At most one sponsored item per trip. It never replaces a story the user would otherwise hear in the same spot.
- Impressions: report the listen with the usual `POST /listens`; listens on sponsored items are the impression count.

## Live mode (talk to Musafir)

### 🔒 `POST /ask`
The user presses the mic button, asks a question and Musafir answers out loud, in the trip's language and voice
(about 3 to 5 seconds end to end). **Nothing is stored** on the server: no transcript, no audio. The app keeps the
conversation and sends the last few turns with each question.

`multipart/form-data` (not JSON). Don't set `Content-Type` yourself in `fetch`/`FormData`; the boundary is added for you.

| Field | Required | Notes |
|---|---|---|
| `audio` | one of `audio` / `text` | the recording: m4a/aac, mp3, wav or webm, at most **2 MB** and **25 seconds** |
| `text` | one of `audio` / `text` | a typed question (testing, demo fallback), 1 to 500 characters. Send `audio` or `text`, not both |
| `lat`, `lng` | yes | current position |
| `heading` | no | degrees 0 to 360; only used when there is no `tripId` |
| `tripId` | no | the active trip. Adds route progress and the neighbouring stories to the answer |
| `history` | no | JSON **string**: `[{ "q": "…", "a": "…" }]`, at most 256 KB. Only the last 6 turns are used and each is cut to 500 characters |
| `language` | no | defaults to the trip's language, else the profile's |

```ts
const form = new FormData();
form.append("audio", { uri: recordingUri, name: "question.m4a", type: "audio/mp4" } as any); // React Native
form.append("lat", String(lat));
form.append("lng", String(lng));
form.append("tripId", tripId);
form.append("history", JSON.stringify(turns.slice(-6))); // [{ q, a }]
const res = await fetch(`${API}/ask`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
```

Response `200`:
```jsonc
{
  "success": true,
  "data": {
    "transcript": "ಈ fort ಯಾಕೆ ಇಷ್ಟು famous",   // what we heard (the typed text when `text` was sent)
    "answerText": "…",
    "language": "kn-IN",
    "voice": "Girish",
    "audio": { "mimeType": "audio/mpeg", "base64": "…", "durationS": 6.2 },
    "timingsMs": { "stt": 520, "llm": 1300, "tts": 1700, "total": 3600 }
  }
}
```
Write `audio.base64` to a cache file (`.mp3`) and play it, ducking the music like a story. Add `{ q: transcript, a: answerText }`
to your history for the next question.

Errors (`{ "success": false, "error": { "code", "message", "details"? } }`):

| Code | Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | missing/invalid ID token |
| `VALIDATION_FAILED` | 400 | no audio or text (or both), bad `lat`/`lng`, unknown `language`, malformed `tripId` or `history`, text over 500 characters |
| `UNSUPPORTED_AUDIO` | 415 | the file is not m4a/aac, mp3, wav or webm |
| `AUDIO_TOO_LARGE` | 413 | audio over 2 MB |
| `AUDIO_TOO_LONG` | 422 | audio over 25 seconds |
| `NOTHING_HEARD` | 422 | empty transcript; say "sorry, I didn't catch that" and let the user retry |
| `TRIP_NOT_FOUND` | 404 | unknown trip, or not this user's |
| `PROFILE_NOT_FOUND` | 404 | no profile yet (`PUT /me` first) |
| `RATE_LIMITED` | 429 | more than 20 questions per user per 10 minutes; `Retry-After` header and `details.retryAfterS` say when to retry |
| `UPSTREAM_UNAVAILABLE` | 502 | speech, language-model or maps service failed after retries; try again |

Notes
- Answers are short and spoken: at most three sentences, about 10 seconds of audio (never much over 15).
- Questions about food or stops ("where should we stop for food?") trigger one live Google Maps lookup near the car; the
  result is used for that answer only.
- Off-topic questions (cricket scores, news) get a short friendly decline.

## Error codes
| Code | Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid or expired ID token (any route except `/health`) |
| `PROFILE_NOT_FOUND` | 404 | `GET`/`PATCH /me`, `POST /trips` or `POST /ask` before onboarding |
| `VALIDATION_FAILED` | 400 | Wrong type, unknown ID, unknown field, empty `interests` (see `details`) |
| `UNKNOWN_VOICE` | 400 | `voice` isn't a Gnani voice from `GET /voices` |
| `VOICE_GENDER_MISMATCH` | 400 | e.g. `voice: "Deepak"` with `voiceGender: "female"` |
| `INVALID_JSON` | 400 | Body isn't valid JSON |
| `TRIP_NOT_FOUND` | 404 | Unknown trip id, or someone else's trip |
| `TRIP_IN_PROGRESS` | 409 | `POST /trips` while a trip is still `building` (`details.tripId`) |
| `TRIP_LIMIT_REACHED` | 429 | More than 10 trips per 24 hours |
| `ROUTE_NOT_FOUND` / `ROUTE_TOO_LONG` | 422 | See `POST /trips` |
| `UNSUPPORTED_AUDIO` / `AUDIO_TOO_LARGE` / `AUDIO_TOO_LONG` / `NOTHING_HEARD` | 415 / 413 / 422 / 422 | See `POST /ask` |
| `RATE_LIMITED` | 429 | More than 20 questions per 10 minutes (`Retry-After`) |
| `UPSTREAM_UNAVAILABLE` | 502 | Google, Gemini, Gnani or storage failed after retries; try again shortly |
| `NOT_FOUND` | 404 | No such route |
| `INTERNAL` | 500 | Server bug, so report it |

## Building the app
Which screen calls which endpoint, the GPS trigger engine, downloads, the player and the mic: see
[`FRONTEND_GUIDE.md`](FRONTEND_GUIDE.md).
