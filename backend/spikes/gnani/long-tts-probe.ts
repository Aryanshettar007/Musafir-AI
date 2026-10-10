// SPIKE (throwaway): can Gnani TTS narrate a ~5 minute story in ONE request?
// 1. Gemini writes a ~5 min script (cached in out/ so reruns don't burn Gemini quota).
// 2. Whole script -> Gnani TTS in a single REST call; record latency, size, real duration.
// 3. Truncation check: STT the last ~25 s of audio and compare with the end of the script.
// 4. If the single call fails, fall back to sentence-chunked TTS and concatenate the mp3s.
// Run: npx tsx spikes/gnani/long-tts-probe.ts
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ThinkingLevel } from "@google/genai";
import { parseBuffer } from "music-metadata";
import { generateJson, LANGUAGE_GUIDE, MODELS, StorySchema, wikipediaFacts, type LanguageStyle } from "../gemini/shared";
import { OUT_DIR, stt, tts } from "./client";

const LONG_DIR = path.join(OUT_DIR, "long");
const TARGET_MINUTES = 5;
// Words per minute measured in spike 2 (Gnani speaking Gemini scripts).
const CASES: Array<{ style: LanguageStyle; wpm: number; sttLang: string }> = [
  { style: "en-IN", wpm: 190, sttLang: "en-IN" },
  { style: "kn-mixed", wpm: 145, sttLang: "kn-IN" },
];

const SYSTEM = `You are "Musafir", a warm radio-jockey style narrator on an Indian road trip.
This is a long-form "episode" for a stretch of highway with nothing else around, so take your time:
tell the story of the place as a narrative with a beginning, middle and end.
Short spoken sentences, no markdown, no lists, numbers as spoken words.
Use ONLY facts from FACTS. Never invent dates, names or numbers.`;

const TAIL_SECONDS = 25;
const BYTES_PER_SECOND = 16_000; // Gnani mp3 is always 128 kbps

async function getScript(style: LanguageStyle, words: number, facts: string): Promise<string> {
  const cache = path.join(LONG_DIR, `script-${style}.json`);
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8")).script;

  const prompt = `PLACE: Srirangapatna, ahead on the right.
LISTENER INTERESTS: history, architecture.
LANGUAGE: ${LANGUAGE_GUIDE[style].guide}
LENGTH: about ${words} words (roughly ${TARGET_MINUTES} minutes spoken). This length matters.

FACTS (English, from Wikipedia):
"""
${facts}
"""`;
  const r = await generateJson({ model: MODELS.flash, system: SYSTEM, prompt, schema: StorySchema, thinking: ThinkingLevel.LOW });
  if (!r.ok) throw new Error(`Gemini failed for ${style}: ${r.error}`);
  console.log(`  Gemini: ${r.ms}ms, ${r.value!.script.split(/\s+/).length} words, ${r.value!.script.length} chars`);
  await writeFile(cache, JSON.stringify(r.value, null, 2));
  return r.value!.script;
}

async function duration(buf: Buffer) {
  return (await parseBuffer(buf, { mimeType: "audio/mpeg" })).format.duration ?? 0;
}

// Split at sentence ends into chunks of at most maxChars.
function chunk(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]+["']?\s*|.+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && (current + s).length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function main() {
  await mkdir(LONG_DIR, { recursive: true });
  const facts = await wikipediaFacts("Srirangapatna", 14_000);
  console.log(`facts: ${facts.length} chars\n`);

  for (const { style, wpm, sttLang } of CASES) {
    console.log(`### ${style}`);
    const script = await getScript(style, wpm * TARGET_MINUTES, facts);
    const { tts: language, voice } = LANGUAGE_GUIDE[style];
    const words = script.split(/\s+/).length;

    // Single request with the whole script.
    const single = await tts({ text: script, voice, language: language as never });
    let audio: Buffer | undefined;
    if (typeof single.value === "string") {
      console.log(`  ✗ single request: ${single.status} after ${single.ms}ms (${single.attempts} tries) ${single.value.slice(0, 200)}`);
    } else {
      audio = single.value;
      const secs = await duration(audio);
      console.log(
        `  ✓ single request: ${single.ms}ms for ${script.length} chars → ${secs.toFixed(1)}s audio ` +
          `(${(secs / 60).toFixed(1)} min), ${(audio.length / 1024 / 1024).toFixed(2)} MB, ${Math.round((words / secs) * 60)} wpm, ` +
          `${(secs / (single.ms / 1000)).toFixed(1)}× real time`,
      );
      await writeFile(path.join(LONG_DIR, `story-${style}-single.mp3`), audio);
    }

    // Fallback: chunked generation, concatenated (mp3 frames concatenate cleanly).
    if (!audio) {
      const parts = chunk(script, 1200);
      const started = performance.now();
      const buffers: Buffer[] = [];
      for (const [i, part] of parts.entries()) {
        const r = await tts({ text: part, voice, language: language as never });
        if (typeof r.value === "string") throw new Error(`chunk ${i} failed: ${r.status} ${r.value.slice(0, 150)}`);
        buffers.push(r.value);
      }
      audio = Buffer.concat(buffers);
      const secs = await duration(audio);
      console.log(`  ✓ chunked (${parts.length} × ≤1200 chars): ${Math.round(performance.now() - started)}ms → ${secs.toFixed(1)}s audio`);
      await writeFile(path.join(LONG_DIR, `story-${style}-chunked.mp3`), audio);
    }

    // Truncation check: transcribe the tail and compare with the script's last words.
    const tail = audio.subarray(Math.max(0, audio.length - TAIL_SECONDS * BYTES_PER_SECOND));
    const tailFile = path.join(LONG_DIR, `tail-${style}.mp3`);
    await writeFile(tailFile, tail);
    const tr = await stt(tailFile, sttLang);
    const transcript = (tr.value as { transcript?: string })?.transcript ?? JSON.stringify(tr.value).slice(0, 200);
    console.log(`  script ends with : …${script.slice(-160)}`);
    console.log(`  audio tail (STT) : …${transcript.slice(-160)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
