// Local demo only. Serves a trip demo at http://localhost:5050: Google Maps (key injected per request from
// backend/.env, never written to disk), a simulated car driving the route, each ready item playing at its trigger, and
// live mode (POST /ask) running in this process with the real clients. No Firebase login: local use only.
// Falls back to OpenStreetMap if the key can't load the Maps JavaScript API.
// Run (from backend/): npx tsx scripts/demo/server.ts [tripId]   then open http://localhost:5050
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { LANGUAGE_IDS, type LanguageId } from "../../src/catalog/languages";
import { geminiClient } from "../../src/clients/gemini";
import { gnaniClient } from "../../src/clients/gnani";
import { createGnaniQueue } from "../../src/clients/gnaniQueue";
import { mapsClient } from "../../src/clients/maps";
import { UpstreamError } from "../../src/clients/upstream";
import { connectDB } from "../../src/config/db";
import { env } from "../../src/config/env";
import { createStorage } from "../../src/config/storage";
import { AppError } from "../../src/errors";
import { Story } from "../../src/models/story.model";
import { Trip } from "../../src/models/trip.model";
import { createAskService } from "../../src/services/ask/ask.service";

const PORT = 5050;

async function loadTrip(id?: string) {
  const storage = createStorage(env);
  const trip = id ? await Trip.findById(id).lean() : await Trip.findOne({ status: "ready" }).sort({ createdAt: -1 }).lean();
  if (!trip) throw new Error("No trip found");
  const stories = new Map(
    (await Story.find({ _id: { $in: trip.items.map((i) => i.storyId).filter(Boolean) } }).lean()).map((s) => [String(s._id), s]),
  );
  const items = [];
  for (const item of trip.items) {
    if (item.status !== "ready" || !item.trigger) continue;
    const story = item.storyId ? stories.get(String(item.storyId)) : undefined;
    const key = story?.audio.storageKey ?? item.audio?.storageKey;
    if (!key) continue;
    items.push({
      type: item.type,
      title: story?.title ?? item.title ?? item.type,
      side: item.side,
      sponsor: item.sponsor?.name ?? null,
      routeDistanceM: item.trigger.routeDistanceM,
      lat: item.trigger.location.coordinates[1],
      lng: item.trigger.location.coordinates[0],
      radiusM: item.trigger.radiusM,
      durationS: story?.audio.durationS ?? item.audio?.durationS ?? 0,
      transcript: story?.script ?? item.transcript ?? "",
      url: await storage.url(key),
    });
  }
  items.sort((a, b) => a.routeDistanceM - b.routeDistanceM);
  return {
    userId: trip.userId,
    page: {
      id: String(trip._id),
      origin: trip.origin.label,
      destination: trip.destination.label,
      language: trip.prefs.language,
      voice: trip.prefs.voice,
      polyline: trip.route.polyline,
      distanceM: trip.route.distanceM,
      durationS: trip.route.durationS,
      items,
    },
  };
}

interface AskBody {
  audioBase64?: string;
  lat: number;
  lng: number;
  history?: Array<{ q: string; a: string }>;
  language?: string;
}

async function main() {
  await connectDB(); // stays connected: live mode reads the trip and nearby places
  const { userId, page: data } = await loadTrip(process.argv[2]);
  const template = await readFile(path.resolve(__dirname, "demo.html"), "utf8");
  const page = template.replace("__DATA__", JSON.stringify(data).replace(/</g, "\\u003c"));

  const gemini = geminiClient({
    apiKeys: env.GEMINI_API_KEYS,
    liteRpm: env.GEMINI_LITE_RPM,
    flashRpm: env.GEMINI_FLASH_RPM,
    concurrency: env.GEMINI_CONCURRENCY,
    flashLanguages: env.GEMINI_FLASH_LANGUAGES,
  });
  const gnani = createGnaniQueue(gnaniClient({ apiKeys: env.GNANI_API_KEYS }));
  const ask = createAskService({
    gemini,
    gnani,
    maps: mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY }),
    // The trip's voice; the language is the trip's unless the page picks another.
    loadProfile: async () => ({ language: data.language as LanguageId, voice: data.voice }),
  });

  async function handleAsk(raw: string) {
    const body = JSON.parse(raw) as AskBody;
    const language = LANGUAGE_IDS.find((l) => l === body.language);
    const { model, ...result } = await ask.ask({
      identity: { uid: userId }, // asked as the trip's owner so the trip context loads
      question: { kind: "audio", audio: Buffer.from(body.audioBase64 ?? "", "base64") },
      position: { lat: body.lat, lng: body.lng },
      tripId: data.id,
      history: (body.history ?? []).slice(-6),
      ...(language && { language }),
    });
    console.log(`[ask] ${model} ${JSON.stringify(result.timingsMs)}`);
    return result;
  }

  http
    .createServer((req, res) => {
      if (req.method === "POST" && req.url === "/ask") {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= 4_000_000) chunks.push(c);
        });
        req.on("end", () => {
          handleAsk(Buffer.concat(chunks).toString("utf8"))
            .then((result) => {
              res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data: result }));
            })
            .catch((err: unknown) => {
              const status = err instanceof AppError ? err.status : err instanceof UpstreamError ? 502 : 500;
              const code = err instanceof AppError ? err.code : err instanceof UpstreamError ? "UPSTREAM_UNAVAILABLE" : "INTERNAL";
              const message = err instanceof Error ? err.message.slice(0, 200) : "error";
              console.error(`[ask] ${code}: ${message}`);
              res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ success: false, error: { code, message } }));
            });
        });
        return;
      }
      if (req.url !== "/" && !req.url?.startsWith("/?")) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(page.replace("__GOOGLE_KEY__", encodeURIComponent(env.GOOGLE_MAPS_API_KEY)));
    })
    .listen(PORT, "127.0.0.1", () => {
      console.log(`Trip ${data.id} (${data.items.length} items) at http://localhost:${PORT}`);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
