# Spike 2 — Gemini (story writing + voice Q&A) findings

> Throwaway spike, run 2026-10-10. SDK `@google/genai` 2.28.0, `generateContent` with
> `responseMimeType: "application/json"` + `responseJsonSchema` (from zod via `z.toJSONSchema`).
> Outputs: `backend/spikes/out/gemini/` — `stories.json`, `story-*.mp3`, `ask-*.mp3`. **Listen to them.**

## Setup
- Env var must be `GEMINI_API_KEY` (case-sensitive).
- Current models (Oct 2026): `gemini-3.8-flash` (stable, recommended), `gemini-3.5-flash-lite` (stable, cheap/fast),
  `gemini-3.1-pro-preview`. Gemini 2.x are legacy/shut down.
- `gemini-3.8-flash` does **not** accept `thinkingLevel: MINIMAL` (400). Use `LOW`.
- Our key is on a quota-limited tier: `gemini-3.1-pro-preview` → 429 every time; `gemini-3.8-flash` also hit 429
  after ~15 calls in a few minutes, and 503 "high demand" occasionally.

## Story writing — one real place (Srirangapatna), facts = 5 000 chars of Wikipedia, target 75 s

| Model | Latency | JSON valid | Quality |
|---|---|---|---|
| **gemini-3.8-flash** (thinking LOW) | 6–10 s | 5/5 | **Excellent in all 5 styles.** Natural spoken Kannada (not bookish), Kanglish exactly in the TTS-friendly form (Kannada script + Latin English words), every claim traceable to the facts, opens with distance + side of road, numbers as words. |
| gemini-3.5-flash-lite | 2–3.5 s | 5/5 | Fine in English. **Broken in Kannada:** Telugu characters leaked into Kannada words and the title, a garbled number, a factual slip ("16th century" for 1610). Kanglish ignored the script instruction (fully romanised) and had nonsense phrases. |
| gemini-3.1-pro-preview | — | — | 429 quota on our key; not evaluated. |

Real durations after Gnani TTS (flash scripts):

| Style | Words | Audio | Words/min |
|---|---|---|---|
| en-IN | 163 | 51 s | 191 |
| kn-IN | 99 | 51 s | 117 |
| kn-mixed (Kanglish) | 146 | 60 s | 145 |
| hi-IN | 163 | 57 s | 171 |
| hi-en (Hinglish) | 194 | 66 s | 176 |

→ Gemini's own `estimatedSeconds` is meaningless (always echoes the target). **Control length with a per-language
word budget** instead (e.g. 60 s ≈ en 190 / kn 115 / Kanglish 145 / hi 170 / Hinglish 175 words), and measure the
real duration from the mp3 after TTS.

Grounding: asking for `factsUsed[]` (claims copied from FACTS in English) worked well — every listed fact was in the
source and the flash scripts made no claims outside it. Cheap way to audit stories; keep it.

## Voice Q&A — 5 questions, written as Gnani STT returns them, with trip context

| Check | flash (LOW) | flash-lite (MINIMAL) |
|---|---|---|
| Kanglish "ಈ ಫೋರ್ಟ್ ಯಾಕೆ ಇಷ್ಟು ಫೇಮಸ್" | ✓ grounded, Kanglish in Kannada script | ✓ grounded, but romanised |
| "ಊಟಕ್ಕೆ ಎಲ್ಲಿ ನಿಲ್ಲಿಸೋಣ" (no food data given) | 429 (quota) | ✓ **did not invent restaurants**, `missingData=nearby_places` |
| "what's coming up next" | ✓ from UPCOMING | ✓ |
| Hinglish (Devanagari STT) distance question | ✓ from ROUTE, Hinglish reply | ✓ |
| Off-topic (cricket) | ✓ declined, `missingData=general_knowledge` | ✓ |
| **LLM latency** | **2.7–9.7 s** (variable) | **1.1–1.5 s** |

Full spoken-reply latency ≈ STT 0.5 s + LLM + TTS ~1.7 s:
- flash: **~5–12 s** — too slow for a conversation in a car.
- flash-lite: **~3.5 s** — acceptable.

The `missingData` field is useful: the server can see `nearby_places` and fetch places (Maps) then re-ask,
i.e. a simple tool loop, instead of the model guessing.

## Gotchas
1. **Quota/rate limits are the biggest risk.** Building a 40-story pack = 40+ flash calls in a burst. We need a
   billing-enabled key (or a paid tier) before slice 1, plus a concurrency limiter + retry on 429/503.
2. Retry 429/500/503 with exponential backoff (implemented in `shared.ts`).
3. **Validate the script (Unicode range) of generated text** — flash-lite mixed Telugu into Kannada. A
   deterministic check (e.g. Kannada output must not contain U+0C00–U+0C7F Telugu chars) catches this for free.
4. Don't trust `estimatedSeconds`; use word budgets + real mp3 duration.

## Not yet tested
- Google Search grounding / Maps grounding (Maps grounding is **English-only** and has attribution/display rules —
  poor fit for pre-generated Kannada audio; evaluate in the Maps spike).
- Streaming responses for Q&A (would let TTS start before the full answer — only if needed).
- More places (small/obscure ones with thin Wikipedia pages — how does it behave with little context?).
- Cost per trip pack.

## Recommendation
- **Stories: `gemini-3.8-flash`, thinking LOW**, structured JSON, facts-only prompt, per-language word budget,
  `factsUsed[]` audit, script-range validation. Latency is irrelevant (pre-generated).
- **Voice Q&A: `gemini-3.5-flash-lite`** for speed (~3.5 s end to end), with the same script validation; if a
  Kannada answer fails validation or comes back romanised when Kannada script was asked, fall back to flash.
- Get a billing-enabled Gemini key before building slice 1.
