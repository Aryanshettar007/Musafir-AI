// Uploads the clips made by generate-voice-demos.ts to storage (STORAGE_DRIVER: B2 bucket or local folder) and
// records each one in MongoDB `voice_demos`, which GET /voices reads.
// Idempotent: clips already recorded with the same size are skipped (pass --force to re-upload everything).
// Run: npx tsx scripts/upload-voice-demos.ts [--force]
import { readFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { LANGUAGE_IDS, type LanguageId } from "../src/catalog/languages";
import { findVoice } from "../src/catalog/voices";
import { connectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { createStorage } from "../src/config/storage";
import { VoiceDemo } from "../src/models/voiceDemo.model";

const DEMO_DIR = path.resolve(__dirname, "../generated/voice-demos");
const PARALLEL_UPLOADS = 8;

interface ManifestEntry {
  voice: string;
  language: string;
  file: string;
  bytes: number;
  durationS: number;
  text: string;
}

async function main() {
  const force = process.argv.includes("--force");
  const manifest: { demos: ManifestEntry[] } = JSON.parse(await readFile(path.join(DEMO_DIR, "manifest.json"), "utf8"));
  const demos = manifest.demos.filter((d) => (LANGUAGE_IDS as string[]).includes(d.language) && findVoice(d.voice));

  await connectDB();
  const storage = createStorage(env);
  console.log(`storage: ${env.STORAGE_DRIVER}${env.STORAGE_DRIVER === "s3" ? ` (bucket ${env.S3_BUCKET})` : ""}`);

  const existing = new Map((await VoiceDemo.find({}, { storageKey: 1, bytes: 1 }).lean()).map((d) => [d.storageKey, d.bytes]));
  const todo = demos.filter((d) => force || existing.get(`voice-demos/${d.file}`) !== d.bytes);
  console.log(`${demos.length} clips in manifest, ${todo.length} to upload`);

  let next = 0;
  let uploaded = 0;
  const failures: string[] = [];
  async function worker() {
    while (next < todo.length) {
      const d = todo[next++];
      const storageKey = `voice-demos/${d.file}`;
      try {
        await storage.put(storageKey, await readFile(path.join(DEMO_DIR, d.file)), "audio/mpeg");
        await VoiceDemo.updateOne(
          { voice: d.voice, language: d.language as LanguageId },
          { $set: { gender: findVoice(d.voice)!.gender, storageKey, bytes: d.bytes, durationS: d.durationS, text: d.text } },
          { upsert: true, runValidators: true },
        );
        uploaded++;
        process.stdout.write(".");
      } catch (err) {
        failures.push(`${storageKey}: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write("x");
      }
    }
  }
  const started = performance.now();
  await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));

  console.log(`\nuploaded ${uploaded}/${todo.length} in ${Math.round((performance.now() - started) / 1000)} s`);
  console.log(`voice_demos records: ${await VoiceDemo.countDocuments()}`);
  if (failures.length) console.log(`failures:\n  ${failures.join("\n  ")}`);
  await mongoose.disconnect();
  if (failures.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
