// Generates a short "Try" demo clip for every Gnani Timbre v2.5 voice in each demo language,
// plus a manifest the app can use to build the voice picker.
// Output: backend/generated/voice-demos/<lang>/<Voice>.mp3 and manifest.json (gitignored).
// Run: npx tsx scripts/generate-voice-demos.ts
import "dotenv/config";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";

const API_KEY = process.env.GNANI_API_KEY;
if (!API_KEY) throw new Error("GNANI_API_KEY missing from backend/.env");

const OUT_DIR = path.resolve(__dirname, "../generated/voice-demos");
// Gnani allows only ONE in-flight request per API key (429 RATE_LIMITED otherwise).
const CONCURRENCY = 1;

type Gender = "male" | "female";

// Timbre v2.5 catalogue (docs.gnani.ai/api/TTS/available-voices). nativeLanguage = Gnani's recommended language.
const VOICES: Array<{ name: string; gender: Gender; nativeLanguage: string }> = [
  { name: "Ambuja", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Asmita", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Bhavna", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Brinda", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Chitra", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Deepak", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Devika", gender: "female", nativeLanguage: "en-IN" },
  { name: "Dhruva", gender: "male", nativeLanguage: "bn-IN" },
  { name: "Falak", gender: "female", nativeLanguage: "gu-IN" },
  { name: "Girish", gender: "male", nativeLanguage: "en-IN" },
  { name: "Hemraj", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Ishaan", gender: "male", nativeLanguage: "mr-IN" },
  { name: "Jalaj", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Jwala", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Kaveri", gender: "female", nativeLanguage: "en-IN" },
  { name: "Kavin", gender: "male", nativeLanguage: "kn-IN" },
  { name: "Kirra", gender: "female", nativeLanguage: "bn-IN" },
  { name: "Lavanya", gender: "female", nativeLanguage: "te-IN" },
  { name: "Lehara", gender: "female", nativeLanguage: "te-IN" },
  { name: "Mehuli", gender: "female", nativeLanguage: "pa-IN" },
  { name: "Nalini", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Noopur", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Omkar", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Poorvi", gender: "female", nativeLanguage: "hi-en" },
  { name: "Pranav", gender: "male", nativeLanguage: "en-IN" },
  { name: "Reshma", gender: "female", nativeLanguage: "ml-IN" },
  { name: "Riyaan", gender: "male", nativeLanguage: "ml-IN" },
  { name: "Roopesh", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Saanvi", gender: "female", nativeLanguage: "kn-IN" },
  { name: "Shlok", gender: "male", nativeLanguage: "en-IN" },
  { name: "Suhana", gender: "female", nativeLanguage: "te-IN" },
  { name: "Trisha", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Trupti", gender: "female", nativeLanguage: "en-IN" },
  { name: "Urmila", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Varuni", gender: "female", nativeLanguage: "te-IN" },
  { name: "Vedika", gender: "female", nativeLanguage: "ta-IN" },
  { name: "Veera", gender: "male", nativeLanguage: "gu-IN" },
  { name: "Vikrant", gender: "male", nativeLanguage: "hi-IN" },
  { name: "Yashvi", gender: "female", nativeLanguage: "hi-IN" },
  { name: "Yukti", gender: "female", nativeLanguage: "te-IN" },
  { name: "Zahira", gender: "female", nativeLanguage: "mr-IN" },
  { name: "Zayan", gender: "male", nativeLanguage: "pa-IN" },
];

// Our recommended defaults (chosen by ear, see docs/ARCHITECTURE.md §5.1a).
const RECOMMENDED: Record<string, Record<Gender, string>> = {
  "en-IN": { male: "Deepak", female: "Nalini" },
  "kn-IN": { male: "Girish", female: "Nalini" },
  "hi-IN": { male: "Deepak", female: "Nalini" },
};

// Demo line per language. Hindi verbs agree with the speaker's gender.
const LINES: Record<string, (name: string, gender: Gender) => string> = {
  "en-IN": (name) => `Hi, I'm ${name}, your Musafir travel companion. Sit back and enjoy the ride.`,
  "kn-IN": (name) => `ನಮಸ್ಕಾರ, ನಾನು ${name}, ನಿಮ್ಮ ಮುಸಾಫಿರ್ ಪ್ರಯಾಣದ ಜೊತೆಗಾರ. ಆರಾಮವಾಗಿ ಕುಳಿತು ಪ್ರಯಾಣವನ್ನು ಎಂಜಾಯ್ ಮಾಡಿ.`,
  "hi-IN": (name, gender) =>
    `नमस्ते, मैं ${name} हूँ, आपका मुसाफ़िर सफ़र का साथी। आराम से बैठिए, सफ़र का मज़ा लीजिए, कहानियाँ मैं ${gender === "male" ? "सुनाऊँगा" : "सुनाऊँगी"}।`,
};

interface DemoEntry {
  voice: string;
  gender: Gender;
  nativeLanguage: string;
  language: string;
  recommended: boolean;
  file: string;
  bytes: number;
  durationS: number;
  text: string;
}

async function synthesize(text: string, voice: string, language: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": API_KEY! },
      body: JSON.stringify({
        text, voice, language, model: "timbre-v2.5",
        audio_config: { container: "mp3", sample_rate: 48000, num_channels: 1 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok) return buf;
    if ((res.status !== 429 && res.status < 500) || attempt >= 5) throw new Error(`${voice}/${language}: ${res.status} ${buf.toString().slice(0, 150)}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function main() {
  const jobs = VOICES.flatMap((v) => Object.keys(LINES).map((language) => ({ ...v, language })));
  const entries: DemoEntry[] = [];
  const failures: string[] = [];
  let next = 0;

  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const text = LINES[job.language](job.name, job.gender);
      try {
        const audio = await synthesize(text, job.name, job.language);
        const rel = `${job.language}/${job.name}.mp3`;
        await mkdir(path.join(OUT_DIR, job.language), { recursive: true });
        await writeFile(path.join(OUT_DIR, rel), audio);
        const durationS = +((await parseBuffer(audio, { mimeType: "audio/mpeg" })).format.duration ?? 0).toFixed(1);
        entries.push({
          voice: job.name, gender: job.gender, nativeLanguage: job.nativeLanguage, language: job.language,
          recommended: RECOMMENDED[job.language][job.gender] === job.name,
          file: rel, bytes: audio.length, durationS, text,
        });
        process.stdout.write(".");
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
        process.stdout.write("x");
      }
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  entries.sort((a, b) => a.language.localeCompare(b.language) || Number(b.recommended) - Number(a.recommended) || a.voice.localeCompare(b.voice));
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify({ model: "timbre-v2.5", generatedAt: new Date().toISOString(), demos: entries }, null, 2));

  const total = entries.reduce((s, e) => s + e.bytes, 0);
  const recommended = entries.filter((e) => e.recommended);
  const recBytes = recommended.reduce((s, e) => s + e.bytes, 0);
  const avgDur = entries.reduce((s, e) => s + e.durationS, 0) / Math.max(entries.length, 1);
  console.log(`\n\n${entries.length}/${jobs.length} demos in ${Math.round((performance.now() - started) / 1000)} s, avg ${avgDur.toFixed(1)} s each`);
  console.log(`total size: ${(total / 1024 / 1024).toFixed(1)} MB`);
  for (const lang of Object.keys(LINES)) {
    const l = entries.filter((e) => e.language === lang);
    console.log(`  ${lang}: ${l.length} clips, ${(l.reduce((s, e) => s + e.bytes, 0) / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log(`recommended only (${recommended.length} clips): ${(recBytes / 1024).toFixed(0)} KB`);
  if (failures.length) console.log(`\nfailures:\n  ${failures.join("\n  ")}`);
  console.log(`\noutput: ${OUT_DIR} (${(await stat(OUT_DIR)).isDirectory() ? "ok" : "missing"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
