# Spike 1 — Gnani Vachana (TTS + STT) findings

> Throwaway spike, run 2026-10-10. Scripts in this folder are probes, not product code.
> Generated audio lands in `backend/spikes/out/` (gitignored) — **listen to it**; quality can't be judged from logs.

## Setup
- Base URL `https://api.vachana.ai`, auth header `X-API-Key-ID: <GNANI_API_KEY>`.
- TTS REST: `POST /api/v1/tts/inference` (JSON in, raw audio bytes out). Model `timbre-v2.5` (v2.0 deprecated).
- STT REST: `POST /stt/v3` (multipart: `audio_file`, `language_code`, `format=transcribe`). Model Prisma v2.5.
- Errors are JSON: `{ success: false, error: { type, message } }` (some 500s use a flat `message`).

## Results

### TTS (Timbre v2.5) — works for every language we care about
| Case | Latency | Size (mp3 48k/64kbps) |
|---|---|---|
| English short (Kaveri / Girish) | 1.1–1.5 s | 62–83 KB |
| Kannada native script (Saanvi / Kavin) | 1.2–1.5 s | 71–105 KB |
| Kanglish — Kannada script + Latin English words | 1.4 s | 93 KB |
| Kanglish — fully romanised | 1.6 s | 101 KB |
| Hindi native (Nalini) | 1.5 s | 104 KB |
| Hinglish `hi-en` romanised (Poorvi) | 1.2 s | 87 KB |
| `language: auto` with Kannada text | 1.1 s | 68 KB |
| **English long-form story, 834 chars (~85 s audio)** | **4.3 s** | **689 KB** (WAV: 4.2 MB) |

- ~1 s fixed overhead + ~5 ms/char. A 60–90 s story generates in ~4 s → pre-generating a 40-story trip is ~3 min sequential, well under a minute with modest concurrency.
- mp3 is ~6× smaller than WAV. Budget ≈ **8 KB per second of audio** → a 40-story trip pack ≈ **20–25 MB**. Fine for offline download.
- 42 voices; per-language recommended voices: Kannada → Saanvi (F) / Kavin (M); English → Kaveri, Devika, Trupti (F) / Girish, Pranav, Shlok (M); Hindi → Nalini etc.; Hinglish → Poorvi.

### STT (Prisma v2.5) — fast and handles code-mixing well
Round-trip of our own TTS output (clean synthetic speech = best case):
| Input | `language_code` | Latency | Transcript quality |
|---|---|---|---|
| English | en-IN | 0.86 s | Perfect (lowercase, no punctuation) |
| Kannada | kn-IN | 0.68 s | Perfect |
| Kanglish | kn-IN | 0.46 s | Correct — English words transliterated into Kannada script (ಫೋರ್ಟ್, ಹಿಸ್ಟರಿ) |
| Kanglish | en-IN | 0.46 s | Romanised, noticeably garbled ("our history lyonly tumb") |
| Hindi | hi-IN | 0.39 s | Perfect, punctuated |
| Hinglish | hi-IN | 0.40 s | Good, Devanagari output, minor errors |
| Hinglish | en-IN | 0.46 s | Good, romanised, minor errors |

## Gotchas (important for the real build)
1. **STT REST max is 30 s, not 60 s** as the docs claim (`MAX_AUDIO_DURATION_EXCEEDED`). Voice questions must be capped at ~25 s client-side.
2. **mp3 at 24 kHz intermittently returns 500** "technical difficulties"; the same request at 48 kHz (API default) succeeded every time. Use 48 kHz mp3.
3. **Transient 500s exist** — production client needs retry with exponential backoff on 5xx, plus timeouts.
4. **STT `language_code` should be the user's selected language**, not `en-IN`: a Kanglish speaker transcribed as `kn-IN` came out accurate (Kannada script); as `en-IN` it was garbled. Gemini reads Kannada script fine, so this is OK downstream.
5. The `bitrate` field seemed to have little effect on size at short lengths — not worth tuning yet.
6. **"Evon" is not in the Gnani docs** (searched the full llms.txt index). The only LLM-related thing is the Agent Builder platform (`/Platform/Get_LLM_Models`), which is a telephony-agent product. → Treat Gemini as the LLM unless the hackathon organisers point to an Evon API.

## Not yet tested
- **Real human speech in a noisy car** — the actual use case. Record a 5–10 s question on your phone (with road/AC noise) and run:
  `npx tsx spikes/gnani/stt-probe.ts path/to/question.m4a kn-IN`
- Streaming TTS (SSE / WebSocket) — only matters for low-latency voice Q&A replies; pre-generated stories don't need it.
- Rate limits / credit consumption per request.
- SSML / text-normalisation (numbers must be written as words — confirmed recommended by docs).

## Recommendation
- **Stories:** generate server-side with TTS REST, mp3 48 kHz, store as files (object storage), ship in trip packs. No streaming needed.
- **Voice Q&A:** STT REST (≤25 s clip, user's language code) → Gemini → TTS REST. Expected ~0.5 s + LLM + ~1.5 s. Revisit TTS SSE streaming only if Q&A feels slow.
- Gnani is solid enough to be the voice core of the product. ✅
