// Manual tester for live mode (POST /ask) against the REAL APIs, calling the service directly. Read-only: nothing is
// written to MongoDB or storage; the reply audio is saved under generated/ask/.
//   npx tsx scripts/ask.ts --text "What is Srirangapatna famous for?" --lat 12.4216 --lng 76.6930 [--language en-IN]
//   npx tsx scripts/ask.ts --audio generated/ask/question.mp3 --lat 12.4216 --lng 76.6930 --language kn-IN
//   options: --trip <id>  --uid <firebase uid>  --heading <deg>  --voice <name>  --out <file.mp3>
// Without --uid there is no profile lookup: language (--language, default en-IN) and voice (--voice, default Deepak) come
// from the flags. With --uid the user's real profile is read. A trip's own language and voice win over both.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import mongoose from "mongoose";
import { LANGUAGE_IDS, type LanguageId } from "../src/catalog/languages";
import { geminiClient } from "../src/clients/gemini";
import { gnaniClient } from "../src/clients/gnani";
import { createGnaniQueue } from "../src/clients/gnaniQueue";
import { mapsClient } from "../src/clients/maps";
import { connectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { createAskService } from "../src/services/ask/ask.service";

const OUT_DIR = path.resolve(__dirname, "../generated/ask");

async function main() {
  const { values } = parseArgs({
    options: {
      text: { type: "string" },
      audio: { type: "string" },
      lat: { type: "string" },
      lng: { type: "string" },
      heading: { type: "string" },
      trip: { type: "string" },
      language: { type: "string" },
      uid: { type: "string" },
      voice: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.text === !values.audio || !values.lat || !values.lng) {
    throw new Error('Usage: --text "..." | --audio file  --lat <n> --lng <n> [--trip id] [--language id] [--uid uid] [--heading deg]');
  }
  // Trips are looked up by owner, so without the owner's uid the trip is always "not found".
  if (values.trip && !values.uid) throw new Error("--trip needs --uid <the trip owner's firebase uid>");
  const language = values.language as LanguageId | undefined;
  if (language && !LANGUAGE_IDS.includes(language)) throw new Error(`Unknown language ${language}`);

  await connectDB();

  const service = createAskService({
    gemini: geminiClient({
      apiKeys: env.GEMINI_API_KEYS,
      liteRpm: env.GEMINI_LITE_RPM,
      flashRpm: env.GEMINI_FLASH_RPM,
      concurrency: env.GEMINI_CONCURRENCY,
      flashLanguages: env.GEMINI_FLASH_LANGUAGES,
    }),
    gnani: createGnaniQueue(gnaniClient({ apiKeys: env.GNANI_API_KEYS })),
    maps: mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY }),
    ...(values.uid ? {} : { loadProfile: async () => ({ language: language ?? "en-IN", voice: values.voice ?? "Deepak" }) }),
  });

  const result = await service.ask({
    identity: { uid: values.uid ?? "script" },
    question: values.audio ? { kind: "audio", audio: await readFile(values.audio) } : { kind: "text", text: values.text as string },
    position: { lat: Number(values.lat), lng: Number(values.lng) },
    heading: values.heading ? Number(values.heading) : undefined,
    tripId: values.trip,
    history: [],
    language,
  });

  await mkdir(OUT_DIR, { recursive: true });
  const out = values.out ?? path.join(OUT_DIR, `answer-${Date.now()}.mp3`);
  await writeFile(out, Buffer.from(result.audio.base64, "base64"));
  console.log(`transcript: ${result.transcript}`);
  console.log(`answer:     ${result.answerText}`);
  console.log(`language=${result.language} voice=${result.voice} model=${result.model}`);
  console.log(`audio: ${result.audio.durationS}s -> ${out}`);
  console.log(`timings ms: ${JSON.stringify(result.timingsMs)}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
