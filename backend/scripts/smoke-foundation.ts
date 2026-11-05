// Real-API smoke check for the shared foundation: one call to each upstream, kept small (Gemini runs on Vertex AI via ADC,
// Gnani allows one request at a time). Run: npx tsx scripts/smoke-foundation.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createGnaniQueue } from "../src/clients/gnaniQueue";
import { gnaniClient } from "../src/clients/gnani";
import { GEMINI_LITE, geminiClient } from "../src/clients/gemini";
import { mapsClient } from "../src/clients/maps";
import { env } from "../src/config/env";
import { narrate } from "../src/speech/narrate";

const OUT_DIR = path.resolve(__dirname, "../generated/smoke");

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    const value = await fn();
    console.log(`[ok] ${label} (${Math.round(performance.now() - started)} ms)`);
    return value;
  } catch (e) {
    console.log(`[FAIL] ${label}: ${e instanceof Error ? e.message : e}`);
    throw e;
  }
}

async function main() {
  const maps = mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY });
  const gemini = geminiClient({
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION,
    concurrency: env.GEMINI_CONCURRENCY,
    flashLanguages: env.GEMINI_FLASH_LANGUAGES,
  });
  const gnani = createGnaniQueue(gnaniClient({ apiKeys: env.GNANI_API_KEYS }));

  // 1. Routes: Bengaluru -> Mysore Palace. Place ids come from autocomplete, so run that first.
  const suggestions = await timed("Places autocomplete \"Mysore pal\"", () =>
    maps.autocomplete({ input: "Mysore pal", bias: { lat: 12.97, lng: 77.59 } }),
  );
  for (const s of suggestions.slice(0, 3)) console.log(`  - ${s.primaryText} | ${s.secondaryText} | ${s.placeId}`);

  const route = await timed("Routes Bengaluru -> Mysore Palace", () =>
    maps.computeRoute({
      origin: { lat: 12.9716, lng: 77.5946 },
      destination: suggestions[0] ? { placeId: suggestions[0].placeId } : { lat: 12.3052, lng: 76.6552 },
    }),
  );
  if (!route) throw new Error("no route returned");
  console.log(`  ${(route.distanceM / 1000).toFixed(1)} km, ${Math.round(route.durationS / 60)} min, polyline ${route.polyline.length} chars`);

  // 2. Gemini flash-lite with a tiny schema.
  const answer = await timed("Gemini generateJson (flash-lite)", () =>
    gemini.generateJson({
      purpose: "smoke",
      system: "You answer with short JSON.",
      prompt: "Name the capital of Karnataka and one famous palace in the city of Mysuru.",
      schema: z.object({ capital: z.string(), palace: z.string() }),
    }),
  );
  console.log(`  model ${answer.model}, attempts ${answer.attempts}: ${JSON.stringify(answer.value)}`);
  if (answer.model !== GEMINI_LITE) console.log("  (flash-lite did not answer; fell back)");

  // 3. Gnani TTS through the queue: two Kannada sentences, voice Girish.
  const text = "ಮೈಸೂರು ಅರಮನೆ ಕರ್ನಾಟಕದ ಅತ್ಯಂತ ಪ್ರಸಿದ್ಧ ಸ್ಥಳಗಳಲ್ಲಿ ಒಂದು. ಪ್ರತಿ ವರ್ಷ ಲಕ್ಷಾಂತರ ಪ್ರವಾಸಿಗರು ಇದನ್ನು ನೋಡಲು ಬರುತ್ತಾರೆ.";
  const audio = await timed("Gnani narrate (kn-IN, Girish)", () =>
    narrate(gnani, { text, voice: "Girish", language: "kn-IN", priority: "interactive" }),
  );
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "smoke-kn-girish.mp3");
  await writeFile(file, audio.audio);
  console.log(`  ${audio.durationS.toFixed(1)} s, ${audio.bytes} bytes -> ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
