// SPIKE (throwaway): find the max text length the TTS REST endpoint accepts in one request,
// and check whether the end of a chunk's audio gets clipped.
// Run: npx tsx spikes/gnani/limit-probe.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { OUT_DIR, stt, tts } from "./client";

const LONG_DIR = path.join(OUT_DIR, "long");

// Longest prefix of text that ends on a sentence boundary and is <= n chars.
function prefix(text: string, n: number) {
  const cut = text.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 0 ? cut.slice(0, end + 1) : cut;
}

(async () => {
  const en = JSON.parse(await readFile(path.join(LONG_DIR, "script-en-IN.json"), "utf8")).script as string;
  const kn = JSON.parse(await readFile(path.join(LONG_DIR, "script-kn-mixed.json"), "utf8")).script as string;

  for (const [label, text, voice, language] of [["en", en, "Kaveri", "en-IN"], ["kn", kn, "Saanvi", "kn-IN"]] as const) {
    for (const n of [1200, 1500, 2000, 2500, 3000, 4000]) {
      const t = prefix(text, n);
      const r = await tts({ text: t, voice, language });
      const ok = typeof r.value !== "string";
      const secs = ok ? (await parseBuffer(r.value as Buffer, { mimeType: "audio/mpeg" })).format.duration ?? 0 : 0;
      console.log(`${label} ${String(t.length).padStart(5)} chars  ${r.status}  ${String(r.ms).padStart(6)}ms  tries=${r.attempts}` + (ok ? `  ${secs.toFixed(1)}s audio` : ""));
      if (!ok) break;
    }
  }

  // Clipping check: last English chunk on its own, transcribe its final ~8 s.
  const lastChunk = en.slice(en.lastIndexOf(". ", en.length - 300) + 2);
  const r = await tts({ text: lastChunk, voice: "Kaveri", language: "en-IN" });
  if (typeof r.value === "string") return console.log("last chunk failed", r.value);
  const tail = r.value.subarray(Math.max(0, r.value.length - 8 * 16_000));
  const file = path.join(LONG_DIR, "tail-en-last-chunk.mp3");
  await writeFile(file, tail);
  const tr = await stt(file, "en-IN");
  console.log(`\nlast chunk text : ${lastChunk}`);
  console.log(`last 8s (STT)   : ${(tr.value as { transcript?: string }).transcript}`);
})();
