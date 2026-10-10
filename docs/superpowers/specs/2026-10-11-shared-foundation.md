# Shared foundation for the trip pipeline, live mode and sponsored ads

> Status: approved direction 2026-10-11. Branch `feature/trip-pipeline`.
> Three features are built in parallel on top of this: the offline trip pipeline
> (`2026-10-10-trip-pipeline-design.md`), live mode (`2026-10-11-live-mode-design.md`) and the sponsored ad
> (`2026-10-11-sponsored-ad-design.md`). This document fixes the **shared modules and their interfaces** so the
> three can be built at the same time without editing the same files.

## Rules for everything built on this
- `src/config/env.ts` is the only module that reads `process.env`. Services and clients get config and clients
  **injected** (factory functions taking a config/deps object), so tests never need real env vars or keys.
  `src/index.ts` and `scripts/*` compose the real objects.
- Clients are interfaces + a factory for the real implementation; tests use fakes from `test/helpers/fakes.ts`.
- Every external call: timeout, retry with backoff on 5xx/429 (honour Google's `retryDelay` / `Retry-After`),
  typed `UpstreamError`, zod validation of the response fields we read, logs without keys or signed URLs.
- Errors to clients keep the existing envelope via `AppError`.

## Modules (paths under `backend/`)

### Config
- `src/config/env.ts` adds: `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `GNANI_API_KEY` (required strings);
  `GEMINI_CONCURRENCY` (2), `GEMINI_LITE_RPM` (10), `GEMINI_FLASH_RPM` (5), `GEMINI_FLASH_LANGUAGES` (comma list,
  default empty, validated against language ids), `TRIPS_PER_DAY` (10), `MAX_ROUTE_KM` (1200),
  `WIKIPEDIA_USER_AGENT` (default `MusafirAI/0.1 (https://github.com/Aryanshettar007/Musafir-AI)`).
- `.env.example` gets every new var (keys empty).

### `src/clients/upstream.ts`
```ts
export class UpstreamError extends Error {
  constructor(readonly service: "gemini" | "gnani" | "maps" | "wikipedia" | "storage", readonly status: number | null,
              message: string, readonly retryable: boolean, readonly retryAfterMs?: number) {}
}
export function withRetry<T>(fn: () => Promise<T>, opts: { attempts: number; baseDelayMs: number;
  isRetryable?: (e: unknown) => boolean; retryAfterMs?: (e: unknown) => number | undefined }): Promise<T>;
export function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }): Promise<Response>;
```

### `src/clients/limiter.ts`
`createLimiter({ concurrency, perMinute? })` → `{ run<T>(fn: () => Promise<T>): Promise<T> }`.
Sliding-window per-minute limit plus concurrency. Injectable clock for tests.

### `src/clients/gemini.ts`
```ts
export const GEMINI_LITE = "gemini-3.5-flash-lite";
export const GEMINI_FLASH = "gemini-3.8-flash";
export interface GenerateJsonRequest<T> {
  purpose: string;                      // for logs: "curate", "story", "ask", "sponsor-ad"
  system: string; prompt: string;
  schema: z.ZodType<T>;                 // sent as responseJsonSchema (z.toJSONSchema) and validated with zod
  language?: LanguageId;                // routes to flash directly when listed in GEMINI_FLASH_LANGUAGES
  validate?: (value: T) => string[];    // extra checks (e.g. script check); returns problems, [] = OK
}
export interface GeminiClient {
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<{ value: T; model: string; attempts: number }>;
}
export function geminiClient(cfg: { apiKey: string; liteRpm: number; flashRpm: number; concurrency: number;
  flashLanguages: LanguageId[] }): GeminiClient;
```
Order of attempts: flash-lite → flash-lite again with the problems appended to the prompt ("Your previous answer
had these problems: …") → flash (thinking LOW). Transport errors are retried inside each attempt (429/500/503,
4 tries, honouring `retryDelay`); invalid JSON, schema failures and `validate` problems move to the next attempt.
If all fail: `UpstreamError("gemini", …, retryable=false)` carrying the last problems. thinkingLevel LOW for both.
Per-model limiters (lite and flash), one shared concurrency limit.

### `src/clients/gnani.ts` and `src/clients/gnaniQueue.ts`
```ts
export interface GnaniClient {
  tts(req: { text: string; voice: string; language: LanguageId }): Promise<Buffer>;         // mp3 48 kHz, timbre-v2.5
  stt(req: { audio: Buffer; filename: string; mimeType: string; languageCode: string }): Promise<{ transcript: string }>;
}
export type GnaniPriority = "interactive" | "background";
export interface GnaniService {                 // what every feature uses
  tts(req: Parameters<GnaniClient["tts"]>[0], opts: { priority: GnaniPriority }): Promise<Buffer>;
  stt(req: Parameters<GnaniClient["stt"]>[0], opts: { priority: GnaniPriority }): Promise<{ transcript: string }>;
}
export function gnaniClient(cfg: { apiKey: string }): GnaniClient;
export function createGnaniQueue(client: GnaniClient): GnaniService;
```
Exact request formats are in `spikes/gnani/client.ts` and `FINDINGS.md` (TTS body, `X-API-Key-ID` header, STT
multipart fields and response shape). The queue: concurrency 1 (Gnani allows one in-flight request per key),
`interactive` before `background`, FIFO within a priority, retries 5xx/429 inside the job so the job keeps its turn.
**One queue per process**, created in `index.ts` (or a script) and injected everywhere.

### `src/clients/maps.ts`
```ts
export interface LatLng { lat: number; lng: number }
export interface GPlace { id: string; name: string; location: LatLng; primaryType?: string; types: string[];
  userRatingCount?: number }
export interface MapsClient {
  computeRoute(req: { origin: LatLng | { placeId: string }; destination: LatLng | { placeId: string } }):
    Promise<{ distanceM: number; durationS: number; polyline: string } | null>;          // null = no route
  searchNearby(req: { center: LatLng; radiusM: number; includedTypes: string[]; maxResults?: number }): Promise<GPlace[]>;
  searchText(req: { query: string; alongPolyline?: string; bias?: { center: LatLng; radiusM: number };
    pageSize?: number; pageToken?: string }): Promise<{ places: GPlace[]; nextPageToken?: string }>;
  autocomplete(req: { input: string; bias?: LatLng; sessionToken?: string }):
    Promise<Array<{ placeId: string; primaryText: string; secondaryText: string }>>;
}
export function mapsClient(cfg: { apiKey: string }): MapsClient;
```
Field masks exactly as in the trip spec §5.2 (no rating/editorialSummary). Autocomplete: Places API (New)
`places:autocomplete`, `includedRegionCodes: ["in"]`, at most 5 suggestions.

### `src/geo/`
Pure functions, ported and tested from `spikes/maps/geo.ts`:
`decodePolyline`, `encodePolyline`, `haversineM`, `indexRoute` → `RouteIndex`, `projectOntoRoute` → `{ distanceFromRouteM,
routeDistanceM, side, closestPoint }`, `pointAtDistance(route, m)`, `sampleRoute(route, stepM)`,
`sliceRoute(route, fromM, toM)` → LatLng[] (for per-segment searches), `routeBounds(route, padM)`.

### `src/speech/`
- `languageStyles.ts`: for each of the 11 `LanguageId`s `{ script: "Latin" | "Devanagari" | "Kannada" | "Tamil" |
  "Telugu" | "Malayalam" | "Bengali" | "Gujarati" | "Gurmukhi"; wordsPerMinute; guide }`. Words per minute from the
  trip spec §5.6. `guide` = how to write that language for Gnani (spike 2 `LANGUAGE_GUIDE`, extended to all 11;
  Hinglish = Latin script).
- `scriptCheck.ts`: `checkScript(text, language, opts?: { wordBudget?: number }) → string[]` (trip spec §5.6 rules:
  no digits, no km/kms, no letters of other Indic scripts, ≥ 60 % expected-script letters for Indic languages,
  `en-IN`/`hi-en` no Indic letters, word count 60–130 % of the budget when given). Messages are written for the
  model ("Contains digits: 1799. Write numbers as words.").
- `chunk.ts`: `chunkScript(text, maxChars = 1800)` on sentence boundaries (`.`, `?`, `!`, `।`, `॥`, newlines);
  a single over-long sentence splits on commas, then spaces.
- `narrate.ts`: `narrate(gnani: GnaniService, req: { text; voice; language; priority }) →
  { audio: Buffer; bytes; durationS }`: chunk → TTS each chunk in order → `Buffer.concat` → duration via
  `music-metadata` (moved to dependencies).
- `wordBudget(language, seconds)` helper.

### `src/models/` (trip spec §4)
`place.model.ts`, `story.model.ts`, `trip.model.ts`, `listen.model.ts`, with the indexes from the spec.
`ItemType` (exported from `trip.model.ts`) = `"trip-intro" | "story" | "food" | "town-welcome" | "episode" |
"long-form" | "sponsored"`. Trip items get optional `sponsor?: { slug: string; name: string }`; a sponsored item has
a `storyId`-less audio reference: `audio?: { storageKey, bytes, durationS }` and `transcript?` stored on the item
itself (stories carry their own). `place.kind` = `"poi" | "town" | "region"`.

### `src/services/sponsor/types.ts`
The `SponsorProvider` and `SponsoredItemSpec` interfaces exactly as in the sponsored-ad spec, so the trip builder
can depend on them before the implementation exists.

### `src/app.ts`
`createApp` takes an extra `routers?: Array<{ path: string; router: express.Router }>` mounted **after** auth,
after the existing catalog and `/me` routes. Features export router factories that take their deps; only
`src/index.ts` composes them. Multipart parsing is per-route (multer, installed here) and never global.

### Test helpers
- `test/helpers/fakes.ts`: fake token verifier (`uid:<uid>` tokens, as today), in-memory storage (records puts,
  signs `https://cdn.example/<key>?sig=test`), scripted fake Gemini (queue of responses or a function), fake Gnani
  (returns a real short mp3 fixture so durations parse; records calls and priorities), fake Maps.
- `test/helpers/mongo.ts`: start/stop mongodb-memory-server and clear collections.
- `test/fixtures/short.mp3`: a short real mp3 (copy a ~5 s voice demo from `generated/`).
- `vitest.config.ts`: unchanged behaviour; the existing tests keep passing.

### Dependencies installed here (nobody else runs `npm install`)
`multer` + `@types/multer`; `music-metadata` moved from devDependencies to dependencies.
