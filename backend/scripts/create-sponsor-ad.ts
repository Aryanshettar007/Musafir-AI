// Pre-generates the sample sponsored ads (Gemini script + Gnani voice + storage) for the demo combinations.
// Cached: ads already in MongoDB make no Gemini or Gnani calls. Sequential, because Gemini's free tier and Gnani's
// one-request-at-a-time limit are tight.
// Run: npx tsx scripts/create-sponsor-ad.ts --sponsor corner-house --languages en-IN,kn-IN,hi-IN [--voices Deepak,Nalini]
import mongoose from "mongoose";
import { LANGUAGE_IDS, type LanguageId } from "../src/catalog/languages";
import { RECOMMENDED_VOICES } from "../src/catalog/voices";
import { geminiClient } from "../src/clients/gemini";
import { gnaniClient } from "../src/clients/gnani";
import { createGnaniQueue } from "../src/clients/gnaniQueue";
import { connectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { createStorage } from "../src/config/storage";
import { createSponsorAds } from "../src/services/sponsor/sponsorAds";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("sponsor") ?? "corner-house";
  const languages = (arg("languages") ?? "en-IN,kn-IN,hi-IN").split(",").map((l) => l.trim());
  for (const l of languages) if (!(LANGUAGE_IDS as readonly string[]).includes(l)) throw new Error(`Unknown language: ${l}`);
  const voicesArg = arg("voices")?.split(",").map((v) => v.trim());

  await connectDB();
  const ads = createSponsorAds({
    gemini: geminiClient({
      apiKeys: env.GEMINI_API_KEYS,
      liteRpm: env.GEMINI_LITE_RPM,
      flashRpm: env.GEMINI_FLASH_RPM,
      concurrency: env.GEMINI_CONCURRENCY,
      flashLanguages: env.GEMINI_FLASH_LANGUAGES,
    }),
    gnani: createGnaniQueue(gnaniClient({ apiKeys: env.GNANI_API_KEYS })),
    storage: createStorage(env),
  });

  let failed = 0;
  for (const language of languages as LanguageId[]) {
    const voices = voicesArg ?? [RECOMMENDED_VOICES[language].male, RECOMMENDED_VOICES[language].female];
    for (const voice of voices) {
      try {
        const started = performance.now();
        const ad = await ads.ensureAd(slug, language, voice);
        console.log(
          `${language} ${voice}: ${ad.durationS.toFixed(1)} s, ${ad.bytes} bytes, ${ad.storageKey} (${Math.round(performance.now() - started)} ms)`,
        );
        console.log(`  "${ad.title}": ${ad.script}`);
      } catch (err) {
        failed++;
        console.error(`${language} ${voice}: FAILED ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await mongoose.disconnect();
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
