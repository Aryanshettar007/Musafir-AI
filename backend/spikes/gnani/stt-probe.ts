// SPIKE (throwaway): transcribe audio with Gnani Prisma and print transcript + latency.
// Default: round-trips the TTS outputs (clean synthetic speech - a best case, not real driving audio).
// Custom:  npx tsx spikes/gnani/stt-probe.ts <path-to-audio> <language_code>
import path from "node:path";
import { OUT_DIR, stt } from "./client";

const ROUND_TRIP: Array<{ file: string; lang: string }> = [
  { file: "en-kaveri.mp3", lang: "en-IN" },
  { file: "kn-saanvi.mp3", lang: "kn-IN" },
  { file: "kanglish-mixed-script.mp3", lang: "kn-IN" },
  { file: "kanglish-mixed-script.mp3", lang: "en-IN" },
  { file: "hi-nalini.mp3", lang: "hi-IN" },
  { file: "hinglish-poorvi.mp3", lang: "hi-IN" },
  { file: "hinglish-poorvi.mp3", lang: "en-IN" },
  { file: "en-long-90s.mp3", lang: "en-IN" },
];

async function run(file: string, lang: string) {
  const { ms, status, value } = await stt(file, lang);
  const transcript = (value as { transcript?: string })?.transcript;
  const label = `${path.basename(file)} [${lang}]`.padEnd(40);
  if (status !== 200 || transcript === undefined) {
    console.log(`✗ ${label} ${status} ${ms}ms  ${JSON.stringify(value).slice(0, 300)}`);
    return;
  }
  console.log(`✓ ${label} ${status} ${String(ms).padStart(5)}ms  ${transcript}`);
}

async function main() {
  const [file, lang] = process.argv.slice(2);
  if (file) return run(path.resolve(file), lang ?? "en-IN");
  for (const c of ROUND_TRIP) await run(path.join(OUT_DIR, c.file), c.lang);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
