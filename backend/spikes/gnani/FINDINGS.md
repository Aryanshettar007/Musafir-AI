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
| Case | Latency | Size (mp3, 48 kHz — always 128 kbps, see gotcha 5) |
|---|---|---|
| English short (Kaveri / Girish) | 1.1–1.5 s | 62–83 KB |
| Kannada native script (Saanvi / Kavin) | 1.2–1.5 s | 71–105 KB |
| Kanglish — Kannada script + Latin English words | 1.4 s | 93 KB |
| Kanglish — fully romanised | 1.6 s | 101 KB |
| Hindi native (Nalini) | 1.5 s | 104 KB |
| Hinglish `hi-en` romanised (Poorvi) | 1.2 s | 87 KB |
| `language: auto` with Kannada text | 1.1 s | 68 KB |
| **English long-form story, 834 chars (44 s audio)** | **4.3 s** | **689 KB** (WAV: 4.2 MB) |

- ~1 s fixed overhead + ~5 ms/char, i.e. **~10× faster than real time**: a 60 s story generates in ~5–6 s → a 40-story trip is ~4 min sequential, ~1 min with modest concurrency.
- mp3 is ~6× smaller than WAV. Budget ≈ **15.6 KB per second of audio** (128 kbps) → a 40-story trip of ~60 s stories ≈ **35–40 MB**. OK for a pre-trip Wi-Fi download; could be cut ~3× by transcoding server-side (e.g. 48 kbps mono AAC/Opus) if needed. `ogg`+`oggopus` output was ~40% smaller than mp3 but iOS playback support needs checking.
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

### Long-form (5 min) narration — `long-tts-probe.ts`, `limit-probe.ts`
Gemini flash wrote ~5 min scripts (en 876 words / 5 511 chars; Kanglish 587 words / 4 185 chars).

| Request size | Result |
|---|---|
| ≤ ~1 900 chars (≈ 1 min 45 s audio) | ✓ every time, en and Kanglish (1 106 → 62 s, 1 476 → 83 s, 1 919 → 107 s) |
| ~2 400 chars and above | ✗ 500 "technical difficulties" every time, even after retries → **hard per-request limit ≈ 2 000 chars** (undocumented, error message is misleading) |

- **Chunking works:** split on sentence boundaries into ≤1 200-char chunks, TTS each, `Buffer.concat` the mp3s →
  en **299 s (5.0 min) in 29 s**, Kanglish **260 s (4.3 min) in 22 s** (sequential; chunks can run in parallel).
- **No clipping:** STT of the final 8 s of the last chunk matched the script's last sentence word for word.
  (A 25 s tail sample dropped the last few words — that was STT on an arbitrary byte-slice, not a TTS problem.)
- Listen for seams between chunks: `out/long/story-en-IN-chunked.mp3`, `out/long/story-kn-mixed-chunked.mp3`.

### Voice × language matrix — `voice-matrix-probe.ts`
6 candidate default voices each read the same line in English, Kannada, Kanglish and Hindi; scored by STT
round-trip similarity (1.00 = perfect; most misses are just "two" → "2" from STT's ITN).

| Voice | en | kn | hi |
|---|---|---|---|
| Kavin (M, Kannada) | 0.97 | 0.95 | 0.97 |
| Girish (M, English) | 0.97 | 0.95 | 0.97 |
| Deepak (M, Hindi) | 0.97 | 0.93 | 0.97 |
| Nalini (F, Hindi) | 1.00 | 0.93 | 0.97 |
| Saanvi (F, Kannada) | 1.00 | 0.92 | 0.97 |
| Kaveri (F, English) | 0.97 | 0.93 | 0.97 |

- **Every voice is intelligible in every language** — a voice's "recommended language" is about accent/naturalness,
  not whether it can speak the language. So the user can be offered any voice for any language; defaults should be
  chosen by ear. Samples: `out/voices/<Voice>-<en|kn|kanglish|hi>.mp3`.
- **Listening verdict (user):** Deepak, Girish and Nalini sound good. Kavin and Kaveri don't, and Saanvi is the worst.
  These three are the defaults.
- **Abbreviations break:** "two km" was spoken/heard as "ಟೂ ಕುಮಾರಿ" with *every* voice. Scripts must spell out
  units and abbreviations ("kilometres"), same as numbers-as-words.

## Gotchas (important for the real build)
1. **STT REST max is 30 s, not 60 s** as the docs claim (`MAX_AUDIO_DURATION_EXCEEDED`). Voice questions must be capped at ~25 s client-side.
2. **mp3 at 24 kHz intermittently returns 500** "technical difficulties"; the same request at 48 kHz (API default) succeeded every time. Use 48 kHz mp3.
3. **Transient 500s exist** — production client needs retry with exponential backoff on 5xx, plus timeouts.
4. **STT `language_code` should be the user's selected language**, not `en-IN`: a Kanglish speaker transcribed as `kn-IN` came out accurate (Kannada script); as `en-IN` it was garbled. Gemini reads Kannada script fine, so this is OK downstream.
5. **The `bitrate` field is ignored** — every mp3 came back at 128 kbps (measured with `duration.ts`). Earlier size→duration estimates in this note assumed 64 kbps and were wrong by 2×; corrected above.
6. **"Evon" is not in the Gnani docs** (searched the full llms.txt index). The only LLM-related thing is the Agent Builder platform (`/Platform/Get_LLM_Models`), which is a telephony-agent product. → Treat Gemini as the LLM unless the hackathon organisers point to an Evon API.
8. **Only ONE in-flight request per API key.** Parallel calls get `429 RATE_LIMITED: "Only 1 active request is allowed at a time"` (found while generating 126 voice demos, 2026-10-10). Likely a plan/tier limit; ask Gnani for higher concurrency. Until then: a single server-side queue for all Gnani calls, with interactive Q&A prioritised over background trip narration.
7. **TTS REST has an undocumented ~2 000-char limit per request** and reports it as a generic 500. Always chunk on sentence boundaries (≤1 800 chars) — the narration service must do this for every story, not just long ones.

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
