// SPIKE (throwaway): can Gemini write grounded, speakable road-trip stories in every target language?
// Matrix: models x language styles, one real place, facts from Wikipedia. Then pipes the best ones
// through Gnani TTS so we can listen to the full Gemini -> Gnani chain.
// Run: npx tsx spikes/gemini/story-probe.ts [modelKey]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ThinkingLevel } from "@google/genai";
import { parseBuffer } from "music-metadata";
import { tts } from "../gnani/client";
import {
  generateJson, LANGUAGE_GUIDE, MODELS, OUT_DIR, retryCount, StorySchema, wikipediaFacts,
  type CallResult, type LanguageStyle, type Story,
} from "./shared";

const PLACE = {
  name: "Srirangapatna",
  wikiTitle: "Srirangapatna",
  side: "right",
  distanceAheadKm: 1.5,
};
const INTERESTS = ["history", "architecture"];
const TARGET_SECONDS = 75;

const SYSTEM = `You are "Musafir", a warm, witty radio-jockey style narrator riding along on an Indian road trip.
You speak to people in a moving car, so:
- Speak naturally, short sentences, no lists, no markdown, no emojis, no stage directions.
- Write every number, year and distance as spoken words (e.g. "seventeen ninety-nine", "one and a half kilometres").
- Open by orienting the listener: the place, how far ahead, and which side of the road.
- Use ONLY facts from the FACTS section. Never invent dates, names, numbers or claims. If unsure, leave it out.
- End with one practical tip or a hook that makes them want to look out the window.`;

function buildPrompt(style: LanguageStyle, facts: string) {
  return `PLACE: ${PLACE.name}
POSITION: ${PLACE.distanceAheadKm} km ahead, on the ${PLACE.side} side of the road.
LISTENER INTERESTS: ${INTERESTS.join(", ")} (lean the story towards these).
LANGUAGE: ${LANGUAGE_GUIDE[style].guide}
LENGTH: about ${TARGET_SECONDS} seconds when spoken aloud.

FACTS (English, from Wikipedia):
"""
${facts}
"""`;
}

const STYLES: LanguageStyle[] = ["en-IN", "kn-IN", "kn-mixed", "hi-IN", "hi-en"];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const onlyModel = process.argv[2] as keyof typeof MODELS | undefined;
  const models = onlyModel ? { [onlyModel]: MODELS[onlyModel] } : MODELS;

  const facts = await wikipediaFacts(PLACE.wikiTitle);
  console.log(`facts: ${facts.length} chars from Wikipedia\n`);

  const results: Array<{ model: string; style: LanguageStyle; result: CallResult<Story> }> = [];

  for (const [key, model] of Object.entries(models)) {
    for (const style of STYLES) {
      // Flash models default to heavier thinking; LOW keeps latency down for prose writing.
      const thinking = key === "pro" ? undefined : ThinkingLevel.LOW;
      const result = await generateJson({ model, system: SYSTEM, prompt: buildPrompt(style, facts), schema: StorySchema, thinking });
      results.push({ model, style, result });

      const v = result.value;
      const words = v ? v.script.split(/\s+/).length : 0;
      const t = result.tokens;
      console.log(
        `${result.ok ? "✓" : "✗"} ${model.padEnd(24)} ${style.padEnd(9)} ${String(result.ms).padStart(6)}ms` +
          (v ? `  ${String(words).padStart(3)} words  est ${v.estimatedSeconds}s  facts ${v.factsUsed.length}` : "") +
          (t ? `  tok in/out/think ${t.input}/${t.output}/${t.thinking ?? 0}` : "") +
          (result.error ? `  ${result.error.slice(0, 200)}` : ""),
      );
    }
  }

  await writeFile(path.join(OUT_DIR, "stories.json"), JSON.stringify(results, null, 2));

  // End-to-end: narrate the flash model's stories with Gnani so we can listen to the real chain.
  console.log("\nGemini -> Gnani TTS:");
  for (const { model, style, result } of results.filter((r) => r.model === MODELS.flash && r.result.ok)) {
    const { tts: language, voice } = LANGUAGE_GUIDE[style];
    const audio = await tts({ text: result.value!.script, voice, language: language as never });
    if (typeof audio.value === "string") {
      console.log(`✗ ${style.padEnd(9)} ${audio.status} ${audio.value.slice(0, 150)}`);
      continue;
    }
    const file = path.join(OUT_DIR, `story-${style}.mp3`);
    await writeFile(file, audio.value);
    const { format } = await parseBuffer(audio.value, { mimeType: "audio/mpeg" });
    const words = result.value!.script.split(/\s+/).length;
    const seconds = format.duration ?? 0;
    console.log(
      `✓ ${style.padEnd(9)} ${audio.ms}ms  ${seconds.toFixed(1)}s audio  ${Math.round((words / seconds) * 60)} words/min` +
        `  -> ${path.relative(process.cwd(), file)}`,
    );
  }
  console.log(`\nGemini retries needed: ${retryCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
