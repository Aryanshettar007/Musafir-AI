// SPIKE (throwaway): print real duration + bitrate of audio files.
// Run: npx tsx spikes/gnani/duration.ts <file...>
import { parseFile } from "music-metadata";
import { stat } from "node:fs/promises";
import path from "node:path";

(async () => {
  for (const file of process.argv.slice(2)) {
    const { format } = await parseFile(file);
    const kb = (await stat(file)).size / 1024;
    console.log(`${path.basename(file).padEnd(28)} ${format.duration?.toFixed(1).padStart(6)}s  ${Math.round((format.bitrate ?? 0) / 1000)}kbps  ${format.sampleRate}Hz  ${kb.toFixed(0)}KB  ${(kb / (format.duration ?? 1)).toFixed(1)}KB/s`);
  }
})();
