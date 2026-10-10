// SPIKE (throwaway): isolate which TTS params trigger 500s with mp3.
import "dotenv/config";

const base = { text: "Welcome to Mysuru, the city of palaces, sandalwood and Dasara.", model: "timbre-v2.5", voice: "Girish", language: "en-IN" };
const full = { sample_rate: 24000, num_channels: 1, container: "mp3", bitrate: "64k" };
const variants: Record<string, object> = {
  "exact client body": { ...base, speed: 1.0, audio_config: full },
  "client body - speed": { ...base, audio_config: full },
  "- num_channels": { ...base, speed: 1.0, audio_config: { sample_rate: 24000, container: "mp3", bitrate: "64k" } },
  "- bitrate": { ...base, speed: 1.0, audio_config: { sample_rate: 24000, num_channels: 1, container: "mp3" } },
  "- sample_rate": { ...base, speed: 1.0, audio_config: { num_channels: 1, container: "mp3", bitrate: "64k" } },
  "sr24000 + nc1": { ...base, audio_config: { sample_rate: 24000, num_channels: 1, container: "mp3" } },
  "sr48000 + nc1 + 64k": { ...base, audio_config: { sample_rate: 48000, num_channels: 1, container: "mp3", bitrate: "64k" } },
};

(async () => {
  for (const [name, body] of Object.entries(variants)) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": process.env.GNANI_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`${name.padEnd(22)} ${res.status} ${res.ok ? buf.length + "B" : buf.toString().slice(0, 90)}`);
  }
})();
