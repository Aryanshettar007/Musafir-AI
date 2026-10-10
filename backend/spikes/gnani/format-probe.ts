// SPIKE (throwaway): find which audio_config combinations the TTS REST endpoint accepts.
// Run: npx tsx spikes/gnani/format-probe.ts
import "dotenv/config";

const configs: Record<string, object> = {
  "mp3 default": { container: "mp3" },
  "mp3 44100/128k": { container: "mp3", sample_rate: 44100, bitrate: "128k" },
  "mp3 48000/128k": { container: "mp3", sample_rate: 48000, bitrate: "128k" },
  "mp3 24000/64k": { container: "mp3", sample_rate: 24000, bitrate: "64k" },
  "mp3 22050/64k": { container: "mp3", sample_rate: 22050, bitrate: "64k" },
  "ogg opus 48000": { container: "ogg", encoding: "oggopus", sample_rate: 48000 },
  "ogg opus 24000": { container: "ogg", encoding: "oggopus", sample_rate: 24000 },
  "wav 24000": { container: "wav", encoding: "linear_pcm", sample_rate: 24000 },
  "wav 16000": { container: "wav", encoding: "linear_pcm", sample_rate: 16000 },
};

async function main() {
  for (const [name, audio_config] of Object.entries(configs)) {
    const started = performance.now();
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": process.env.GNANI_API_KEY! },
      body: JSON.stringify({
        text: "Welcome to Mysuru, the city of palaces.",
        model: "timbre-v2.5",
        voice: "Kaveri",
        language: "en-IN",
        audio_config,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Math.round(performance.now() - started);
    const detail = res.ok ? `${buf.length}B` : buf.toString().slice(0, 120);
    console.log(`${name.padEnd(18)} ${res.status} ${String(ms).padStart(5)}ms ${res.headers.get("content-type")} ${detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
