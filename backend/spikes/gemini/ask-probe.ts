// SPIKE (throwaway): voice Q&A brain. Questions are written the way Gnani STT returns them
// (e.g. Kanglish comes back in Kannada script). Checks: latency, language match, and whether the
// model refuses to invent things it has no data for (restaurants!).
// Run: npx tsx spikes/gemini/ask-probe.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ThinkingLevel } from "@google/genai";
import { parseBuffer } from "music-metadata";
import { z } from "zod";
import { tts } from "../gnani/client";
import { generateJson, LANGUAGE_GUIDE, MODELS, OUT_DIR, wikipediaFacts, type LanguageStyle } from "./shared";

const AnswerSchema = z.object({
  answer: z.string().describe("Spoken answer, exactly as it should be read aloud"),
  answeredFromContext: z.boolean().describe("true only if every claim in the answer comes from CONTEXT"),
  missingData: z
    .enum(["none", "nearby_places", "route_info", "general_knowledge"])
    .describe("What data would be needed to answer properly, if CONTEXT was not enough"),
});

const SYSTEM = `You are "Musafir", a friendly voice companion in a moving car on an Indian road trip.
Answer the passenger's spoken question in at most three short sentences, for listening, not reading.
Write numbers as spoken words. No markdown, no lists.
Use ONLY the CONTEXT. If the CONTEXT does not contain the answer, say briefly that you'll check and
don't guess - never invent restaurant names, distances, ratings, timings or facts.
Reply in the language style given in LANGUAGE.`;

const QUESTIONS: Array<{ id: string; style: LanguageStyle; q: string; expect: string }> = [
  { id: "fort-famous", style: "kn-mixed", q: "ಈ ಫೋರ್ಟ್ ಯಾಕೆ ಇಷ್ಟು ಫೇಮಸ್", expect: "grounded answer from facts" },
  { id: "food", style: "kn-mixed", q: "ಊಟಕ್ಕೆ ಎಲ್ಲಿ ನಿಲ್ಲಿಸೋಣ", expect: "no invented restaurants; missingData=nearby_places" },
  { id: "next", style: "en-IN", q: "what's coming up next", expect: "Ranganathittu from UPCOMING" },
  { id: "distance", style: "hi-en", q: "यहाँ से मैसूर कितना दूर है", expect: "18 km from ROUTE" },
  { id: "offtopic", style: "en-IN", q: "who won the last cricket world cup", expect: "no guessing" },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const facts = await wikipediaFacts("Srirangapatna", 3000);
  const lastStory = JSON.parse(await readFile(path.join(OUT_DIR, "stories.json"), "utf8"))
    .find((r: { model: string; style: string }) => r.model === MODELS.flash && r.style === "en-IN")?.result.value.script;

  const context = `POSITION: on the Bengaluru-Mysuru highway, passing Srirangapatna (on the right).
ROUTE: destination Mysuru, eighteen kilometres and about twenty-five minutes away.
LAST STORY PLAYED: ${lastStory}
UPCOMING ON ROUTE: Ranganathittu Bird Sanctuary (three kilometres, left), then "Welcome to Mysuru" (eighteen kilometres).
FACTS ABOUT SRIRANGAPATNA:
"""
${facts}
"""`;

  for (const model of process.argv[2] === "lite" ? [MODELS.lite] : [MODELS.flash]) {
    console.log(`\n### ${model}`);
    for (const { id, style, q, expect } of QUESTIONS) {
      const prompt = `LANGUAGE: ${LANGUAGE_GUIDE[style].guide}\n\nCONTEXT:\n${context}\n\nQUESTION (speech-to-text, may have errors): ${q}`;
      const r = await generateJson({ model, system: SYSTEM, prompt, schema: AnswerSchema, thinking: model === MODELS.flash ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL });
      if (!r.ok) {
        console.log(`✗ ${id.padEnd(12)} ${r.ms}ms ${r.error?.slice(0, 200)}`);
        continue;
      }
      const v = r.value!;
      console.log(`✓ ${id.padEnd(12)} ${String(r.ms).padStart(5)}ms  fromContext=${v.answeredFromContext} missing=${v.missingData}  [expect: ${expect}]`);
      console.log(`    ${v.answer}`);

      // Full reply latency = LLM + TTS (STT measured separately at ~0.4-0.9 s in spike 1).
      if (model === MODELS.flash) {
        const { tts: language, voice } = LANGUAGE_GUIDE[style];
        const audio = await tts({ text: v.answer, voice, language: language as never });
        if (typeof audio.value !== "string") {
          const file = path.join(OUT_DIR, `ask-${id}.mp3`);
          await writeFile(file, audio.value);
          const { format } = await parseBuffer(audio.value, { mimeType: "audio/mpeg" });
          console.log(`    🔊 TTS ${audio.ms}ms, ${format.duration?.toFixed(1)}s audio → LLM+TTS ${r.ms + audio.ms}ms`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
