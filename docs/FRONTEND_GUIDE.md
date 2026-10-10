# Musafir-AI: what the app needs to build

For the Expo app (`App/`). Exact request and response shapes are in [`API.md`](API.md); this guide says **which screen
calls what, in which order, and what the phone has to do itself** (GPS triggers, downloads, playback, the mic).

> Backend state (branch `feature/trip-pipeline`): every endpoint below is built, tested and runs against the real
> Gnani, Gemini, Google Maps, MongoDB Atlas and Backblaze B2. Today the app stores the profile on the phone and calls
> no endpoint yet, so this is mostly wiring.

## 1. The whole app on one page

```
Login/Signup (Firebase, in the app)
   └─ GET /me ── 404 → Onboarding ── GET /catalog, GET /voices ── PUT /me
             └─ 200 → Home
Home / Where to?
   ├─ GET /places/autocomplete   (destination search box)
   ├─ POST /trips                (Start) ──▶ Trip screen
   └─ GET /trips                 (recent trips)
Trip screen
   ├─ GET /trips/:id  every 3–5 s while "building"; download each ready item's audio
   ├─ GPS trigger engine (on the phone) plays items offline as the car reaches them
   ├─ POST /listens   (played / skipped, queued while offline)
   └─ 🎤  POST /ask   (live mode: speak a question, play the spoken answer)
Settings
   ├─ GET /me, PATCH /me
   └─ GET /voices (change narrator)
```

| Endpoint | Screen | What for |
|---|---|---|
| `GET /health` | — | Server up? (no token) |
| `GET /catalog` | Onboarding, Settings | Genders, the 11 languages, interests, music modes, defaults |
| `GET /voices?language=&gender=` | Onboarding, Settings, Where to? | Voice picker with ▶ Try clips |
| `GET /me` | After login, Settings | Profile; `404 PROFILE_NOT_FOUND` = show onboarding |
| `PUT /me` | Onboarding (Continue / Skip) | Save the profile (every field optional) |
| `PATCH /me` | Settings | Change some settings |
| `GET /places/autocomplete?q=&lat=&lng=&sessionToken=` | Home search box | Destination suggestions |
| `POST /trips` | Home "Start" | Start building a trip (`202`, returns `tripId`) |
| `GET /trips/:id` | Trip screen | Build progress + items with audio links and trigger points |
| `GET /trips?limit=` | Home "Recent trips" | Trip history |
| `POST /listens` | Trip screen (background) | What was played/skipped (also counts sponsored impressions) |
| `POST /ask` | Trip screen 🎤 | Live mode: voice question → spoken answer |

## 2. Setup once

**Base URL.** Put it in config, e.g. `EXPO_PUBLIC_API_URL`. On a phone in development use the PC's LAN IP
(`http://192.168.x.x:3000`), not `localhost`. The backend runs with `cd backend && npm run dev`.

**One API helper.** Every call except `/health` needs the Firebase ID token, and every response uses the same
envelope, so wrap `fetch` once:

```ts
// App/src/lib/api.ts
import { auth } from "@/config/firebase";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();          // the SDK refreshes it
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),   // FormData sets its own boundary
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const json = await res.json();
  if (!json.success) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data as T;
}
```
Branch on `error.code`, never on the message. The full list is at the end of `API.md`.

**Never put backend API keys in the app** (Gnani, Gemini, Places). Everything goes through our server. The only
Google key the app may hold is the **Maps SDK for Android/iOS** key that `react-native-maps` needs to draw the map;
restrict it to the app's package name in Google Cloud.

## 3. Login → onboarding → home

1. After Firebase login or signup: `GET /me`.
   - `200` → Home. Keep the profile in memory/context (language, voice, interests, musicMode).
   - `404 PROFILE_NOT_FOUND` → Onboarding.
2. **Onboarding** (`(onboarding)/index.tsx`, currently saves to local storage):
   - Load the options from `GET /catalog`. Remove the hardcoded lists in `constants/onboarding.ts`: they contain
     languages Gnani can't narrate and miss Kannada, Tamil, Telugu and others.
   - **Voice picker** (new): Male / Female → `GET /voices?language=<chosen>&gender=<g>` → list with the recommended
     voice first and a ▶ Try button that plays `demoUrl` (a signed link, refetch when the picker opens, don't save it;
     `demoUrl` can be `null`).
   - **Music mode** instead of the old Spotify button: `rj` (radio host between songs, default), `duck-only`, `off`.
   - Continue → `PUT /me` with what the user chose. **Skip → `PUT /me` with `{}`** (defaults are applied).
     `age` is a number. Unknown fields are rejected, so don't send old local-only fields.
3. **Settings** (`(tabs)/settings.tsx`, currently local): read `GET /me`, save with `PATCH /me` sending only what
   changed. Changing language may move a default voice to that language's default; show the voice returned.
   Logout: Firebase `signOut()` and clear cached trips.

## 4. Home: choosing a destination and starting a trip

- **Search box:** debounce ~300 ms, call `GET /places/autocomplete?q=…&lat=…&lng=…&sessionToken=…` once the user
  has typed 2+ characters. Generate one `sessionToken` (UUID) when the search box opens and reuse it until a place is
  chosen (Google bills that as one session). Show `primaryText` / `secondaryText`; keep the `placeId`.
  Don't call Google Places from the app (the app's current reverse-geocoding with `expo-location` for "Current
  location" is fine to keep).
- **Per-trip choices** (optional): language, voice, interests prefilled from the profile; send only what changed in
  `prefs`. They apply to this trip only.
- **Start:**
  ```ts
  const { tripId } = await api<{ tripId: string }>("/trips", { method: "POST", body: JSON.stringify({
    origin: { lat, lng, label: "Current location" },          // or { placeId, label }
    destination: { placeId, label: primaryText },
    prefs: { language: "kn-IN" },                              // optional
  }) });
  ```
  Errors to handle: `TRIP_IN_PROGRESS` (409; open `error.details.tripId` instead), `TRIP_LIMIT_REACHED` (429),
  `ROUTE_NOT_FOUND` / `ROUTE_TOO_LONG` (422), `PROFILE_NOT_FOUND` (go to onboarding), `UPSTREAM_UNAVAILABLE` (502,
  "try again").
- **Recent trips:** `GET /trips?limit=20` (summaries; tap → Trip screen with that `tripId`).

## 5. Trip screen: build progress, downloads, GPS playback

### 5.1 Poll while building
`GET /trips/:id` every 3–5 s while `status === "building"`; stop at `ready` or `failed`.
- Show `progress.ready / progress.total` and the route (`route.polyline`, Google encoded polyline; decode it for
  `react-native-maps` `<Polyline>`).
- Items come in **route order**. The first ones are usually ready within a minute, long before the whole trip.
- `failed` items stay in the list: skip them. `status: "failed"` has `failure.code` (`NOTHING_BUILT`,
  `DISCOVERY_FAILED`): show "couldn't build this trip, try again".

### 5.2 Download for offline
- For every item with `status: "ready"`, download `audio.url` to the app's document directory
  (`expo-file-system`), file name = item `id` + `.mp3`. Start as soon as an item is ready; show "X of Y MB" with
  `totalBytes`.
- **Store `tripId` and item ids, never the URLs.** URLs are signed and expire after 7 days; every `GET /trips/:id`
  returns fresh ones. If a download gets **403**, refetch the trip and retry with the new URL.
- Save the trip JSON locally too, so the whole trip plays with no network.

### 5.3 The trigger engine (on the phone, works offline)
Each item has `trigger: { lat, lng, radiusM, routeDistanceM }`. The backend already placed the trigger *before* the
place, so the story is half-way through when the car passes it. The app only has to:
1. Track location in the background: `expo-location` `startLocationUpdatesAsync` + `expo-task-manager`
   (needs the development build, not Expo Go; foreground service notification on Android).
2. On each fix: if the phone is within `radiusM` of an item's trigger, and the item hasn't been played or skipped,
   queue it. Never play two at once; if several are queued, play in route order and drop ones the car has already
   passed by more than ~1 km (compare `routeDistanceM` with the car's position along the route).
3. Remember what was played (by item id) so a reopened app doesn't replay.
- The trip intro (`type: "trip-intro"`) triggers at the start of the route.
- `side` (`left` / `right` / `none`) is where the place is; the narration already says "on your left". Show an arrow
  if you like.

### 5.4 Player
- Use `expo-audio`. Show title, item type, side, and the transcript (optional captions).
- **Sponsored items:** `type: "sponsored"` with `sponsor: { name }`. Show a clear **"Sponsored · Corner House"**
  label while it plays. At most one per trip; it's a sample slot for the demo.
- Music: if the user plays music in another app, request audio focus with ducking so their music gets quieter during
  a story (`musicMode: "duck-only"` / `"rj"`); `off` = do nothing special. The "radio host between songs" links come in
  a later backend release.

### 5.5 Report listens
Queue events locally and send them in batches (when online, every minute or at trip end):
```ts
await api("/listens", { method: "POST", body: JSON.stringify({ events: [
  { id: uuid(), tripId, itemId, event: "started" | "completed" | "skipped", at: new Date().toISOString() },
] }) });
```
`id` is a UUID made on the phone, so resending the same batch is safe. The response says which events were rejected.
Completed places are avoided on the user's next trips; sponsored listens are the impression count.

## 6. Live mode: talk to Musafir (🎤 on the Trip screen)

**No chat screen** (product rule): this is a mic button and spoken answers only. A short caption of the answer is fine.

1. Tap the mic → record with `expo-audio` (m4a/AAC, mono is fine) → tap again to stop. Max **25 s**, max 2 MB.
2. Pause/duck the current story while recording and while the answer plays; resume after.
3. Send `multipart/form-data`:
   ```ts
   const form = new FormData();
   form.append("audio", { uri: recordingUri, name: "question.m4a", type: "audio/mp4" } as any);
   form.append("lat", String(lat));
   form.append("lng", String(lng));
   form.append("tripId", tripId);                          // optional, gives "what's next" context
   form.append("history", JSON.stringify(turns.slice(-6))); // [{ q, a }] for follow-up questions
   const r = await api<AskResult>("/ask", { method: "POST", body: form });
   ```
4. Write `r.audio.base64` to a cache file (`.mp3`) and play it. Push `{ q: r.transcript, a: r.answerText }` onto
   `turns` (keep it in memory only; nothing is stored on the server).
5. Errors: `NOTHING_HEARD` (say "Sorry, I didn't catch that"), `AUDIO_TOO_LONG`, `AUDIO_TOO_LARGE`,
   `UNSUPPORTED_AUDIO`, `RATE_LIMITED` (20 questions per 10 min; `Retry-After`), `UPSTREAM_UNAVAILABLE` (try again).
6. Offline: `/ask` needs the network. Show "I'll answer once we're back in coverage".

Typical answer time: 3.5–4.5 s end to end. Good demo questions: "What's coming up next?", "Where should we stop for
food?", "ಈ fort ಯಾಕೆ famous?".

## 7. Design rules
- Voice and GPS are the product: no text chatbot UI.
- Light and dark mode only. **No purple or blue themes.**
- Languages: only the 11 from `GET /catalog`.

## 8. Build checklist
- [ ] `api()` helper + base URL config
- [ ] `GET /me` routing after login; onboarding from `/catalog` + voice picker + music mode; `PUT /me`
- [ ] Settings on `GET /me` / `PATCH /me`
- [ ] Destination search on `/places/autocomplete` with session token
- [ ] `POST /trips` + error handling; recent trips from `GET /trips`
- [ ] Trip screen: poll `GET /trips/:id`, route polyline, progress
- [ ] Downloads to the file system (store ids, refetch on 403), offline trip JSON
- [ ] Background location + trigger engine + player queue (development build)
- [ ] Sponsored label
- [ ] `POST /listens` queue
- [ ] 🎤 live mode with `POST /ask`

## 9. Seeing it working before the app is ready
The backend has a local browser demo: Google Maps, a simulated car driving the latest ready trip (Bengaluru → Mysuru),
each story playing at its trigger, and the 🎤 live mode. It behaves the way the Trip screen should.
```bash
cd backend
npx tsx scripts/demo/server.ts [tripId]     # then open http://localhost:5050 (needs backend/.env)
```
