# Live mode (talk to Musafir) — design

> Status: approved direction 2026-10-11. Branch `feature/trip-pipeline`. Builds on the shared foundation
> (`docs/superpowers/specs/2026-10-11-shared-foundation.md`) and `docs/ARCHITECTURE.md` §5.4.

## Goal
While driving, the user presses a button, asks a question by voice ("ಈ fort ಯಾಕೆ famous?", "where should we stop
for food?", "what's coming up next?") and Musafir answers out loud in the trip's language and voice, within ~3–4 s.

## Decisions
- **Everything runs on the backend.** The app only records and plays. Gnani keys never ship to the app, and every
  Gnani call goes through the single shared queue with `interactive` priority (one in-flight request per key).
- **Nothing is stored.** No database writes, no object storage, no transcripts in logs (log only lengths and
  timings). The reply audio is returned in the response body.
- **The app keeps the conversation.** It sends the last few turns with each question so follow-ups work
  ("and how old is it?"). The server is stateless.
- **Model:** `gemini-3.5-flash-lite` first, `gemini-3.8-flash` as fallback (shared Gemini client).

## API

### `POST /ask` (multipart/form-data, auth required)
| Field | Required | Notes |
|---|---|---|
| `audio` | one of audio/text | the recorded question: m4a/aac, mp3, wav or webm, ≤ 2 MB and ≤ 25 s (Gnani STT max is 30 s) |
| `text` | one of audio/text | typed question, skips STT (for testing and the demo fallback), ≤ 500 chars |
| `lat`, `lng` | yes | current position |
| `heading` | no | degrees, used only when there is no trip |
| `tripId` | no | the active trip; gives route and upcoming-stories context |
| `history` | no | JSON string: `[{ "q": "...", "a": "..." }]`, at most 6 turns, each ≤ 500 chars; extra turns ignored |
| `language` | no | defaults to the trip's language, else the profile's |

Response `200`:
```jsonc
{
  "transcript": "ಈ fort ಯಾಕೆ ಇಷ್ಟು famous",       // what we heard (= text when text was sent)
  "answerText": "…",
  "language": "kn-IN", "voice": "Girish",
  "audio": { "mimeType": "audio/mpeg", "base64": "…", "durationS": 6.2 },
  "timingsMs": { "stt": 520, "llm": 1300, "tts": 1700, "total": 3600 }
}
```
The app writes the base64 audio to a cache file and plays it (ducking music like a story).

Errors: `VALIDATION_FAILED` 400 (missing audio and text, bad fields), `AUDIO_TOO_LONG` 422 (> 25 s),
`UNSUPPORTED_AUDIO` 415, `NOTHING_HEARD` 422 (empty transcript, the app says "sorry, I didn't catch that"),
`TRIP_NOT_FOUND` 404 (not the user's trip), `PROFILE_NOT_FOUND` 404, `RATE_LIMITED` 429 (more than 20 questions per
user per 10 minutes, in memory), `UPSTREAM_UNAVAILABLE` 502.

## Flow
1. **Validate** fields; measure audio duration with `music-metadata` (reject > 25 s).
2. **STT** (only for audio): Gnani STT through the queue, `interactive` priority, language code = the language's
   `sttLanguage` (`hi-en` → `hi-IN`). Empty transcript → `NOTHING_HEARD`.
3. **Context** (all read-only, from MongoDB):
   - With `tripId`: project the position onto the trip route → distance done/remaining, time remaining (average
     speed), the previous 2 and next 3 items (type, title, side, km ahead, first 300 chars of transcript).
   - Places within 5 km of the position from the `places` collection (name, kind, first 600 chars of facts).
   - The conversation `history`.
4. **Answer** with Gemini (JSON schema): `{ answer, missingData: "none" | "nearby_places" | "route_info" |
   "general_knowledge", placesQuery? }`. Persona: the same RJ narrator, spoken style, ≤ 3 short sentences, in the
   requested language's style (same language guides as stories), numbers and units spelled out, only facts from the
   context, never invent restaurants, prices, timings or distances.
5. **Tool loop (once):** if `missingData = nearby_places`, run Places Text Search with `placesQuery` (default
   "famous restaurants") biased to the position (radius 10 km, up to 5 results: name, rating count, distance,
   side relative to the route when on a trip) and ask Gemini again with those results. Places results are used
   for this answer only and never stored.
6. **Script check** (shared): on failure retry once, then fall back to flash.
7. **TTS** through the queue, `interactive` priority, the trip's (or profile's) voice and language. Answers are
   short; chunk only if > 1 800 chars.
8. Return the JSON above.

**Off-topic** questions (cricket scores, etc.) get a friendly short decline, as tested in spike 2.

## Module layout
```
src/services/ask/askContext.ts    (trip + nearby places context, pure where possible)
src/services/ask/ask.service.ts   (orchestration: stt → context → gemini (+tool loop) → check → tts)
src/services/ask/prompt.ts        (system prompt, schema)
src/controllers/ask.controller.ts, src/routes/ask.routes.ts (multer memory storage, 2 MB limit)
src/middleware/rateLimit.ts       (small in-memory per-user limiter)
```

## Testing
- Unit: context building (projection, previous/next items), prompt building, history trimming.
- Service with fakes (Gnani, Gemini, Maps): audio path, text path, tool loop, script-check fallback, empty
  transcript, no trip.
- Routes (supertest + in-memory MongoDB): auth, validation, audio too long, other user's trip, rate limit,
  response shape; and that **no collection gains documents** and storage `put` is never called.
- Manual: `scripts/ask.ts --text "..." --lat --lng [--trip]` and `--audio file.mp3` against the real APIs.
