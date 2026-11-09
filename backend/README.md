# Musafir AI — Backend

Express + TypeScript API. It builds trip packs (route → places → facts → scripts → narrated mp3s), answers voice
questions in live mode, and manages users, custom voices, sponsors and reports. Runs on Google Cloud Run.

## Run it

```bash
npm install
cp .env.example .env                      # fill in the values
gcloud auth application-default login     # Gemini runs on Vertex AI with Application Default Credentials
npm run dev                               # http://localhost:3000, health check at GET /health
```

```bash
npm run typecheck     # src + tests
npm test              # Vitest; API tests use an in-memory MongoDB
npm run build         # compile to dist/
```

## Layout

Requests flow **routes → controllers → services → clients**.

| Path | What it holds |
|---|---|
| `src/routes/`, `src/controllers/` | HTTP layer: request validation and responses |
| `src/services/` | Business logic: trips, ask (live mode), custom voices, sponsors, reports, users |
| `src/pipeline/` | Trip pipeline: discover, match, classify, curate, plan slots, write scripts. Every tunable number is in `rules.ts` |
| `src/speech/` | Narration: sentence chunking, per-language style, script checks, spelling out numbers |
| `src/clients/` | One client per external API: Gnani (with the single request queue and key rotation), Gemini, Maps, Wikipedia, Firebase, Apple, storage |
| `src/geo/` | Route geometry: polyline decoding, snapping, side of road |
| `src/models/` | Mongoose models |
| `src/catalog/` | Languages, voices, interests and onboarding options |
| `src/sponsors/` | Demo sponsor data |
| `src/config/` | Environment validation, database, storage |
| `scripts/` | CLI tools: build a trip, ask a question, demo server, voice demos, sponsor seeding, Cloud Run deploy |
| `spikes/` | Throwaway API experiments, each with a `FINDINGS.md`. Never imported by `src/` |
| `test/` | Vitest tests |

## Handy scripts

```bash
npx tsx scripts/build-trip.ts --from "Bengaluru" --to "Mysore Palace" --language kn-IN --voice Girish
npx tsx scripts/ask.ts --text "What is Srirangapatna famous for?" --lat 12.4216 --lng 76.6930
npx tsx scripts/demo/server.ts            # local map + live-mode demo at http://localhost:5050
bash scripts/deploy-cloud-run.sh          # deploy to Cloud Run (secrets go to Secret Manager)
```

API reference: [`../docs/API.md`](../docs/API.md). Design: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
