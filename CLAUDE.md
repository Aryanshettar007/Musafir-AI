# Musafir-AI

Voice-first AI road-trip companion — "Netflix for Road Trips". The app follows the user's GPS along a route and
automatically plays short audio stories (history, culture, food, local businesses) in their language, and lets them
ask questions by voice. Built for the Gnani hackathon: **voice and Indian languages are the product**.

Architecture and roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Read it before making design decisions.

## Repo layout
- `backend/` — Express + TypeScript API, MongoDB Atlas (Mongoose). Owned by Aryan.
- `App/` — Expo / React Native app (Expo Router). Owned by a teammate. Follow `App/AGENTS.md` for anything in `App/`.
- `backend/spikes/` — throwaway API experiments + `FINDINGS.md` per spike. Never import spike code into `src/`.
- `docs/` — architecture, specs, plans.
- `reference/` — original idea sketches.

## Git rules — MUST follow
- **Never `git commit` or `git push` without asking the user first and getting an explicit yes.** Every time — approval for one commit does not carry over to the next.
- **Never add Claude attribution** to commits or PRs: no `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line. The user is the sole author.
- Work on feature branches (`feature/<topic>`), never directly on `main`. `git pull` before branching.
- Never commit secrets. `.env` files are gitignored; add new variables to `backend/.env.example` with an empty value.

## Engineering practices
- TypeScript everywhere, `strict` mode. No `any` in product code — model external API responses with types and validate them at the boundary (e.g. zod).
- Small, single-purpose modules with clear interfaces: routes → controllers → services → clients. External APIs (Gnani, Gemini, Google Maps) each live behind their own client module so they can be mocked and swapped.
- All secrets and config come from environment variables, read and validated in one config module. API keys stay on the server — never ship them to the app.
- Every external call has a timeout, retries with exponential backoff on 5xx/429, and typed error handling. Never swallow errors; log with context.
- Validate every request body/query/param. Return consistent JSON errors: `{ success: false, error: { code, message } }`.
- Write tests for services and pure logic (route geometry, trigger/geofence logic, ranking). Test-first for new logic where practical.
- Run typecheck (`npx tsc --noEmit`) and tests before saying work is done. Report failures honestly.
- Keep it simple (YAGNI): build the current slice, not imagined future features.
- Match the surrounding code's style and naming; keep comments for the non-obvious "why".

## Product constraints
- No text chatbot UI — interaction is voice + GPS. Voice Q&A is allowed.
- Theme: light and dark mode only. No purple or blue themes.
- Languages = the 11 Gnani Timbre v2.5 languages (`backend/src/catalog/languages.ts`): en-IN, hi-IN, hi-en (Hinglish), kn-IN, ta-IN, te-IN, ml-IN, mr-IN, bn-IN, gu-IN, pa-IN. Don't add languages Gnani can't narrate.

## Commands (backend)
```bash
cd backend
npm install
npm run dev              # tsx watch src/index.ts
npm run build            # tsc
npm run typecheck        # src + tests
npm test                 # vitest (API tests use an in-memory MongoDB)
npx tsx spikes/<name>/<script>.ts   # run a spike probe
npx tsx scripts/build-trip.ts --from "Bengaluru" --to "Mysore Palace" --language kn-IN --voice Girish   # real trip
npx tsx scripts/demo/server.ts      # local map + live-mode demo at http://localhost:5050
```

## Gnani gotchas (from spike 1, see backend/spikes/gnani/FINDINGS.md)
- Default voices (user's choice by ear): male **Deepak** (main male voice: English, Hindi, Hinglish) and **Girish** (Kannada), female **Nalini** (all). Don't default to Saanvi or Kavin.
- TTS: `POST https://api.vachana.ai/api/v1/tts/inference`, model `timbre-v2.5`, use **mp3 at 48 kHz** (24 kHz mp3 intermittently 500s).
- STT: `POST https://api.vachana.ai/stt/v3`, **max 30 s audio** (docs wrongly say 60). Use the user's language code, not `en-IN`.
- Retry 5xx — Gnani returns transient "technical difficulties" errors.
- mp3 is always 128 kbps (the `bitrate` field is ignored) ≈ 15.6 KB per second of audio.
- Scripts must spell out numbers AND abbreviations/units ("kilometres", not "km" — every voice mispronounces it).
- **Only ONE in-flight Gnani request per API key** (429 RATE_LIMITED otherwise). Route every Gnani call through the single priority queue; never fire them in parallel.
- TTS REST fails (generic 500) above ~2 000 chars per request — always chunk scripts on sentence boundaries (≤1 800 chars) and concatenate the mp3s.

## Maps / Wikipedia gotchas (from spike 3, see backend/spikes/maps/FINDINGS.md)
- Env var `GOOGLE_MAPS_API_KEY`. Routes API + Places API (New): the `X-Goog-FieldMask` header is mandatory and sets the billing SKU — request only the fields you need.
- Google Maps Platform terms limit caching Places content: persist `place_id`, not names/ratings/reviews, long term.
- Wikipedia API: send a descriptive User-Agent with a contact URL (generic UAs get 429), call sequentially, retry 429.

## Gemini gotchas (from spike 2, see backend/spikes/gemini/FINDINGS.md)
- SDK `@google/genai`; env var `GEMINI_API_KEY`. **Free tier only, no Pro, no paid plan (decided 2026-10-10).** Use `gemini-3.5-flash-lite` for everything; fall back to `gemini-3.8-flash` (thinking `LOW`, it rejects `MINIMAL`) when lite fails. Free-tier flash = 5 requests/min per model; Pro = 0.
- Use `responseMimeType: "application/json"` + `responseJsonSchema: z.toJSONSchema(schema)`, then validate with zod.
- flash-lite can leak Telugu characters into Kannada — always validate the Unicode script of generated text.
- Control length with per-language word budgets, not the model's duration estimate.
- Retry 429/503 with backoff; quota is tight on the free tier.
