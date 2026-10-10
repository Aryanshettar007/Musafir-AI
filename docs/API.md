# Musafir-AI backend API

For the app. Base URL in development: `http://<your PC's LAN IP>:3000` (a phone can't reach `localhost` on the PC).

## Conventions
- JSON in, JSON out.
  - Success: `{ "success": true, "data": … }`
  - Error: `{ "success": false, "error": { "code": "…", "message": "…", "details"?: [{ "path", "message" }] } }`
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

## Error codes
| Code | Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid or expired ID token (any route except `/health`) |
| `PROFILE_NOT_FOUND` | 404 | `GET`/`PATCH /me` before onboarding |
| `VALIDATION_FAILED` | 400 | Wrong type, unknown ID, unknown field, empty `interests` (see `details`) |
| `UNKNOWN_VOICE` | 400 | `voice` isn't a Gnani voice from `GET /voices` |
| `VOICE_GENDER_MISMATCH` | 400 | e.g. `voice: "Deepak"` with `voiceGender: "female"` |
| `INVALID_JSON` | 400 | Body isn't valid JSON |
| `NOT_FOUND` | 404 | No such route |
| `INTERNAL` | 500 | Server bug, so report it |

## Changes needed in the current onboarding screen (`App/src/app/(onboarding)/index.tsx`)
1. Load genders, languages and interests from `GET /catalog`. The current list has Spanish, French and others that
   Gnani can't narrate, and is missing Kannada, Tamil, Telugu and other Indian languages.
2. Replace the **Connect Spotify** button with the music mode choice. Spotify was dropped (docs/ARCHITECTURE.md §5.4a).
3. Add the narrator voice picker: Male/Female → `GET /voices` → "Try" plays `demoUrl`.
4. On Continue/Skip, call `PUT /me`, then go to tabs. After login, call `GET /me` to decide between onboarding and home.
