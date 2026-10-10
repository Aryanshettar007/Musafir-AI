// SPIKE (throwaway): how do candidate default voices sound outside their "recommended" language?
// Every voice reads the same line in every language. Objective signal: STT round-trip similarity
// (a voice that mangles a language transcribes worse). Subjective signal: LISTEN to out/voices/.
// Run: npx tsx spikes/gnani/voice-matrix-probe.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { OUT_DIR, stt, tts, type TtsLanguage } from "./client";

const VOICES = [
  { name: "Kavin", gender: "M", home: "Kannada" },
  { name: "Girish", gender: "M", home: "English" },
  { name: "Deepak", gender: "M", home: "Hindi" },
  { name: "Nalini", gender: "F", home: "Hindi" },
  { name: "Saanvi", gender: "F", home: "Kannada" },
  { name: "Kaveri", gender: "F", home: "English" },
];

const LINES: Array<{ id: string; tts: TtsLanguage; stt: string; text: string }> = [
  { id: "en", tts: "en-IN", stt: "en-IN", text: "Welcome to Mysuru, the city of palaces. The famous palace is just two kilometres ahead on your left." },
  { id: "kn", tts: "kn-IN", stt: "kn-IN", text: "ಮೈಸೂರಿಗೆ ಸ್ವಾಗತ. ಅರಮನೆಗಳ ನಗರ. ಪ್ರಸಿದ್ಧ ಅರಮನೆ ಇನ್ನು ಎರಡು ಕಿಲೋಮೀಟರ್ ಮುಂದೆ ನಿಮ್ಮ ಎಡಗಡೆ ಇದೆ." },
  { id: "kanglish", tts: "kn-IN", stt: "kn-IN", text: "Mysuru ಗೆ welcome. ಇದು city of palaces. Famous palace ಇನ್ನು two km ಮುಂದೆ ನಿಮ್ಮ left side ಅಲ್ಲಿ ಇದೆ." },
  { id: "hi", tts: "hi-IN", stt: "hi-IN", text: "मैसूर में आपका स्वागत है, महलों का शहर। मशहूर महल बस दो किलोमीटर आगे आपकी बाईं तरफ है।" },
];

// Character-level similarity (1 = identical) after stripping punctuation, case and spaces.
function similarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\p{P}\s]/gu, "");
  const [x, y] = [norm(a), norm(b)];
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - dp[x.length][y.length] / Math.max(x.length, y.length, 1);
}

async function main() {
  const dir = path.join(OUT_DIR, "voices");
  await mkdir(dir, { recursive: true });
  const table: Record<string, Record<string, string>> = {};

  for (const v of VOICES) {
    const row: Record<string, string> = {};
    for (const line of LINES) {
      const r = await tts({ text: line.text, voice: v.name, language: line.tts });
      if (typeof r.value === "string") {
        row[line.id] = `✗ ${r.status}`;
        continue;
      }
      const file = path.join(dir, `${v.name}-${line.id}.mp3`);
      await writeFile(file, r.value);
      const secs = (await parseBuffer(r.value, { mimeType: "audio/mpeg" })).format.duration ?? 0;
      const tr = await stt(file, line.stt);
      const transcript = (tr.value as { transcript?: string })?.transcript ?? "";
      // Kanglish transcribes into Kannada script, so it can't be compared char-by-char with the mixed-script source.
      const score = line.id === "kanglish" ? "  —  " : similarity(line.text, transcript).toFixed(2);
      row[line.id] = `${score} ${secs.toFixed(1)}s`;
      console.log(`${v.name.padEnd(7)} ${line.id.padEnd(9)} ${score}  ${secs.toFixed(1)}s  STT: ${transcript}`);
    }
    table[`${v.name} (${v.gender}, ${v.home})`] = row;
  }

  console.log("\nSTT similarity (1.00 = perfect) and duration:");
  console.table(table);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
