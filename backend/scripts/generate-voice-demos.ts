// Generates a short "Try" demo clip for every Gnani Timbre v2.5 voice in each demo language,
// plus a manifest the app can use to build the voice picker.
// Output: backend/generated/voice-demos/<lang>/<Voice>.mp3 and manifest.json (gitignored).
// Run: npx tsx scripts/generate-voice-demos.ts [lang ...]   (default: every language; existing clips are skipped)
import "dotenv/config";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { LANGUAGE_IDS, type LanguageId } from "../src/catalog/languages";
// Voices and recommended defaults come from the product catalog so the picker and the clips never drift apart.
import { RECOMMENDED_VOICES, VOICES, type VoiceGender } from "../src/catalog/voices";

const API_KEY = process.env.GNANI_API_KEY1 ?? process.env.GNANI_API_KEY;
if (!API_KEY) throw new Error("GNANI_API_KEY1 missing from backend/.env");

const OUT_DIR = path.resolve(__dirname, "../generated/voice-demos");
// Gnani allows only ONE in-flight request per API key (429 RATE_LIMITED otherwise).
const CONCURRENCY = 1;

// Demo line per language (every Gnani Timbre v2.5 language). Some languages' grammar agrees with the speaker's gender.
const LINES: Record<LanguageId, (name: string, gender: VoiceGender) => string> = {
  "en-IN": (name) => `Hi, I'm ${name}, your Musafir travel companion. Sit back and enjoy the ride.`,
  "hi-IN": (name, gender) =>
    `नमस्ते, मैं ${name} हूँ, आपका मुसाफ़िर सफ़र का साथी। आराम से बैठिए, सफ़र का मज़ा लीजिए, कहानियाँ मैं ${gender === "male" ? "सुनाऊँगा" : "सुनाऊँगी"}।`,
  "hi-en": (name, gender) =>
    `Hey there! Main ${name} hoon, aapka Musafir travel companion. Let's make your journey awesome, raaste ke best spots aur stories main ${gender === "male" ? "bataunga" : "bataungi"}!`,
  "kn-IN": (name) => `ನಮಸ್ಕಾರ, ನಾನು ${name}, ನಿಮ್ಮ ಮುಸಾಫಿರ್ ಪ್ರಯಾಣದ ಜೊತೆಗಾರ. ಆರಾಮವಾಗಿ ಕುಳಿತು ಪ್ರಯಾಣವನ್ನು ಎಂಜಾಯ್ ಮಾಡಿ.`,
  "ta-IN": (name) => `வணக்கம், நான் ${name}, உங்கள் முசாஃபிர் பயணத் துணை. நிம்மதியாக உட்கார்ந்து பயணத்தை ரசியுங்கள்.`,
  "te-IN": (name, gender) =>
    `నమస్కారం, నేను ${name}, మీ ముసాఫిర్ ప్రయాణ ${gender === "male" ? "సహచరుడిని" : "సహచరిని"}. హాయిగా కూర్చుని ప్రయాణాన్ని ఆస్వాదించండి.`,
  "ml-IN": (name, gender) =>
    `നമസ്കാരം, ഞാൻ ${name}, നിങ്ങളുടെ മുസാഫിർ യാത്രാ ${gender === "male" ? "കൂട്ടുകാരൻ" : "കൂട്ടുകാരി"}. സുഖമായി ഇരുന്ന് യാത്ര ആസ്വദിക്കൂ.`,
  "mr-IN": (name, gender) =>
    `नमस्कार, मी ${name}, ${gender === "male" ? "तुमचा मुसाफिर प्रवासाचा सोबती" : "तुमची मुसाफिर प्रवासाची सोबतीण"}. आरामात बसा आणि प्रवासाचा आनंद घ्या.`,
  "bn-IN": (name) => `নমস্কার, আমি ${name}, আপনার মুসাফির ভ্রমণসঙ্গী। আরাম করে বসুন, যাত্রা উপভোগ করুন।`,
  "gu-IN": (name, gender) =>
    `નમસ્તે, હું ${name}, ${gender === "male" ? "તમારો" : "તમારી"} મુસાફિર પ્રવાસ સાથી. આરામથી બેસો અને સફરનો આનંદ માણો.`,
  "pa-IN": (name, gender) =>
    `ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ${name} ਹਾਂ, ${gender === "male" ? "ਤੁਹਾਡਾ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦਾ ਸਾਥੀ" : "ਤੁਹਾਡੀ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦੀ ਸਾਥਣ"}। ਆਰਾਮ ਨਾਲ ਬੈਠੋ ਅਤੇ ਸਫ਼ਰ ਦਾ ਮਜ਼ਾ ਲਓ।`,
};

interface DemoEntry {
  voice: string;
  gender: VoiceGender;
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
  const requested = process.argv.slice(2);
  const unknown = requested.filter((l) => !(LANGUAGE_IDS as string[]).includes(l));
  if (unknown.length) throw new Error(`Unknown language(s): ${unknown.join(", ")}`);
  const languages = (requested.length ? requested : LANGUAGE_IDS) as LanguageId[];

  // Keep entries already in the manifest; only synthesize clips that don't exist yet.
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const previous: DemoEntry[] = await readFile(manifestPath, "utf8").then((t) => JSON.parse(t).demos as DemoEntry[]).catch(() => []);
  const exists = (rel: string) => access(path.join(OUT_DIR, rel)).then(() => true, () => false);
  const entries: DemoEntry[] = [];
  for (const e of previous) if (await exists(e.file)) entries.push(e);
  const have = new Set(entries.map((e) => e.file));

  const jobs = VOICES.flatMap((v) => languages.map((language) => ({ ...v, language })))
    .filter((j) => !have.has(`${j.language}/${j.name}.mp3`));
  console.log(`${jobs.length} clips to generate (${have.size} already exist)`);
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
          recommended: RECOMMENDED_VOICES[job.language][job.gender] === job.name,
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
  for (const e of entries) e.recommended = RECOMMENDED_VOICES[e.language as LanguageId]?.[e.gender] === e.voice;
  entries.sort((a, b) => a.language.localeCompare(b.language) || Number(b.recommended) - Number(a.recommended) || a.voice.localeCompare(b.voice));
  await writeFile(manifestPath, JSON.stringify({ model: "timbre-v2.5", generatedAt: new Date().toISOString(), demos: entries }, null, 2));

  const total = entries.reduce((s, e) => s + e.bytes, 0);
  const recommended = entries.filter((e) => e.recommended);
  const recBytes = recommended.reduce((s, e) => s + e.bytes, 0);
  const avgDur = entries.reduce((s, e) => s + e.durationS, 0) / Math.max(entries.length, 1);
  console.log(`\n\n${entries.length} demos in manifest; generated ${jobs.length - failures.length}/${jobs.length} in ${Math.round((performance.now() - started) / 1000)} s, avg ${avgDur.toFixed(1)} s each`);
  console.log(`total size: ${(total / 1024 / 1024).toFixed(1)} MB`);
  for (const lang of LANGUAGE_IDS) {
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
