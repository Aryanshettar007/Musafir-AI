// Local demo only. Serves a trip demo at http://localhost:5050: Google Maps (key injected per request from
// backend/.env, never written to disk), a simulated car driving the route, each ready item playing at its trigger, and
// live mode (POST /ask) running in this process with the real clients. No Firebase login: local use only.
// "New trip" plans a trip from the page (autocomplete, language, voice, interests) and builds it here with the real
// pipeline, as the demo user. Falls back to OpenStreetMap if the key can't load the Maps JavaScript API.
// Run (from backend/): npx tsx scripts/demo/server.ts [tripId]   then open http://localhost:5050 (or /?trip=<id>)
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { z } from "zod";
import { INTEREST_IDS, INTERESTS } from "../../src/catalog/interests";
import { LANGUAGE_IDS, LANGUAGES, type LanguageId } from "../../src/catalog/languages";
import { RECOMMENDED_VOICES, VOICES } from "../../src/catalog/voices";
import { geminiClient } from "../../src/clients/gemini";
import { gnaniClient } from "../../src/clients/gnani";
import { createGnaniQueue } from "../../src/clients/gnaniQueue";
import { mapsClient } from "../../src/clients/maps";
import { UpstreamError } from "../../src/clients/upstream";
import { wikipediaClient } from "../../src/clients/wikipedia";
import { connectDB } from "../../src/config/db";
import { env } from "../../src/config/env";
import { createStorage } from "../../src/config/storage";
import { AppError } from "../../src/errors";
import { Story } from "../../src/models/story.model";
import { Trip } from "../../src/models/trip.model";
import { createAskService } from "../../src/services/ask/ask.service";
import { createSponsorAds } from "../../src/services/sponsor/sponsorAds";
import { createSponsorProvider } from "../../src/services/sponsor/sponsorProvider";
import { createTripBuilder, createTripService } from "../../src/services/trip";
import { putProfile } from "../../src/services/user.service";

const PORT = 5050;
// Trips planned from the page belong to this user (a script user, like build-trip.ts's).
const DEMO_UID = "demo-planner";
const ID = /^[a-f0-9]{24}$/;
const LOG_LINES = 40;

const storage = createStorage(env);

async function loadTrip(id?: string) {
  const trip = id ? await Trip.findById(id).lean() : await Trip.findOne({ status: "ready" }).sort({ createdAt: -1 }).lean();
  if (!trip) return null;
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
    id: String(trip._id),
    status: trip.status,
    origin: trip.origin.label,
    destination: trip.destination.label,
    language: trip.prefs.language,
    voice: trip.prefs.voice,
    polyline: trip.route.polyline,
    distanceM: trip.route.distanceM,
    durationS: trip.route.durationS,
    totalItems: trip.items.length,
    items,
  };
}

// What the planner offers: languages, every voice (recommended ones first per language), interests.
const CATALOG = {
  languages: LANGUAGES.map((l) => ({ id: l.id, label: l.label })),
  voices: VOICES.map((v) => ({ name: v.name, gender: v.gender })),
  recommended: RECOMMENDED_VOICES,
  interests: INTERESTS.map((i) => ({ id: i.id, label: i.label })),
  maxRouteKm: env.MAX_ROUTE_KM,
};

const PlaceRef = z.strictObject({ placeId: z.string().min(1).max(300), label: z.string().trim().min(1).max(100) });
const PlanBody = z.strictObject({
  origin: PlaceRef,
  destination: PlaceRef,
  language: z.enum(LANGUAGE_IDS),
  voice: z.string().refine((v) => VOICES.some((x) => x.name === v), "Unknown voice"),
  interests: z.array(z.enum(INTEREST_IDS)).min(1),
});

const AskBody = z.object({
  audioBase64: z.string().max(4_000_000),
  lat: z.number(),
  lng: z.number(),
  tripId: z.string().regex(ID),
  history: z.array(z.object({ q: z.string(), a: z.string() })).max(20).optional(),
  language: z.string().optional(),
});

async function main() {
  await connectDB(); // stays connected: live mode and the planner read and write trips
  const startTrip = process.argv[2];

  const maps = mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY });
  const gemini = geminiClient({
    apiKey: env.GEMINI_API_KEY,
    liteRpm: env.GEMINI_LITE_RPM,
    flashRpm: env.GEMINI_FLASH_RPM,
    concurrency: env.GEMINI_CONCURRENCY,
    flashLanguages: env.GEMINI_FLASH_LANGUAGES,
  });
  const gnani = createGnaniQueue(gnaniClient({ apiKey: env.GNANI_API_KEY }));

  // Build progress for the planner, kept in memory per trip (the trip document has the item statuses).
  const logs = new Map<string, string[]>();
  const log = (tripId: string, line: string) => {
    const lines = logs.get(tripId) ?? [];
    lines.push(line);
    logs.set(tripId, lines.slice(-LOG_LINES));
    console.log(`[build ${tripId.slice(-6)}] ${line}`);
  };
  const builder = createTripBuilder({
    maps,
    wikipedia: wikipediaClient({ userAgent: env.WIKIPEDIA_USER_AGENT }),
    gemini,
    gnani,
    storage,
    sponsor: createSponsorProvider({ ads: createSponsorAds({ gemini, gnani, storage }) }),
    onEvent(e) {
      if (e.kind === "stage") log(e.tripId, `${e.stage}${e.ms !== undefined ? ` (${(e.ms / 1000).toFixed(1)} s)` : ""}${e.detail ? `: ${e.detail}` : ""}`);
      if (e.kind === "selection") log(e.tripId, `picked ${e.selection.picks.length} stops`);
      if (e.kind === "item") log(e.tripId, `${e.status === "ready" ? "✓" : "✗"} ${e.type} · ${e.title}${e.cached ? " (cached)" : ""}${e.error ? `: ${e.error}` : ""}`);
      if (e.kind === "warn") log(e.tripId, `warning: ${e.message}`);
      if (e.kind === "finished") log(e.tripId, `finished: ${e.status} in ${(e.ms / 1000).toFixed(0)} s`);
    },
  });
  const trips = createTripService({ maps, builder, storage, limits: { tripsPerDay: 1000, maxRouteKm: env.MAX_ROUTE_KM } });

  const ask = createAskService({
    gemini,
    gnani,
    maps,
    // Only a fallback: the trip's own language and voice win (see ask.service).
    loadProfile: async () => ({ language: "en-IN", voice: "Deepak" }),
  });

  async function handleAsk(raw: string) {
    const body = AskBody.parse(JSON.parse(raw));
    const trip = await Trip.findById(body.tripId, { userId: 1 }).lean();
    if (!trip) throw new AppError(404, "TRIP_NOT_FOUND", "No such trip.");
    const language = LANGUAGE_IDS.find((l) => l === body.language);
    const { model, ...result } = await ask.ask({
      identity: { uid: trip.userId }, // asked as the trip's owner so the trip context loads
      question: { kind: "audio", audio: Buffer.from(body.audioBase64, "base64") },
      position: { lat: body.lat, lng: body.lng },
      tripId: body.tripId,
      history: (body.history ?? []).slice(-6),
      ...(language && { language }),
    });
    console.log(`[ask] ${model} ${JSON.stringify(result.timingsMs)}`);
    return result;
  }

  async function handlePlan(raw: string) {
    const body = PlanBody.parse(JSON.parse(raw));
    await putProfile({ uid: DEMO_UID }, { language: body.language, voice: body.voice, interests: body.interests });
    const created = await trips.createTrip(
      { uid: DEMO_UID },
      {
        origin: body.origin,
        destination: body.destination,
        prefs: { language: body.language, voice: body.voice, interests: body.interests },
      },
    );
    log(created.tripId, `planned ${body.origin.label} → ${body.destination.label} (${body.language}, ${body.voice})`);
    return created;
  }

  async function tripStatus(id: string) {
    const trip = await Trip.findById(id, { status: 1, stage: 1, failure: 1, "items.status": 1, origin: 1, destination: 1, route: 1, createdAt: 1 }).lean();
    if (!trip) throw new AppError(404, "TRIP_NOT_FOUND", "No such trip.");
    const count = (s: string) => trip.items.filter((i) => i.status === s).length;
    return {
      id,
      status: trip.status,
      stage: trip.stage,
      failure: trip.failure ?? null,
      origin: trip.origin.label,
      destination: trip.destination.label,
      distanceM: trip.route.distanceM,
      durationS: trip.route.durationS,
      items: { total: trip.items.length, ready: count("ready"), failed: count("failed") },
      createdAt: trip.createdAt,
      log: logs.get(id) ?? [],
    };
  }

  async function recentTrips() {
    const rows = await Trip.find({}, { status: 1, origin: 1, destination: 1, prefs: 1, "items.status": 1, route: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return rows.map((t) => ({
      id: String(t._id),
      status: t.status,
      origin: t.origin.label,
      destination: t.destination.label,
      language: t.prefs.language,
      voice: t.prefs.voice,
      km: Math.round(t.route.distanceM / 1000),
      ready: t.items.filter((i) => i.status === "ready").length,
      total: t.items.length,
      createdAt: t.createdAt,
    }));
  }

  const json = (res: http.ServerResponse, status: number, body: unknown) =>
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));

  function fail(res: http.ServerResponse, where: string, err: unknown) {
    const status = err instanceof AppError ? err.status : err instanceof UpstreamError ? 502 : err instanceof z.ZodError ? 400 : 500;
    const code =
      err instanceof AppError ? err.code : err instanceof UpstreamError ? "UPSTREAM_UNAVAILABLE" : err instanceof z.ZodError ? "VALIDATION_ERROR" : "INTERNAL";
    const message =
      err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err instanceof Error ? err.message.slice(0, 300) : "error";
    console.error(`[${where}] ${code}: ${message}`);
    json(res, status, { success: false, error: { code, message } });
  }

  function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size <= 6_000_000) chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }

  async function renderPage(tripId: string | undefined) {
    const data = await loadTrip(tripId);
    // The template is read per request, so edits to demo.html show on reload.
    const template = await readFile(path.resolve(__dirname, "demo.html"), "utf8");
    const safe = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
    return template
      .replace("__DATA__", safe(data))
      .replace("__CATALOG__", safe(CATALOG))
      .replace("__GOOGLE_KEY__", encodeURIComponent(env.GOOGLE_MAPS_API_KEY));
  }

  http
    .createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      const route = `${req.method} ${url.pathname}`;
      const run = (where: string, fn: () => Promise<unknown>) =>
        fn()
          .then((data) => json(res, 200, { success: true, data }))
          .catch((err: unknown) => fail(res, where, err));

      if (route === "POST /ask") {
        void readBody(req).then((raw) => run("ask", () => handleAsk(raw)));
        return;
      }
      if (route === "GET /api/places") {
        const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
        const sessionToken = url.searchParams.get("session")?.slice(0, 64) || undefined;
        void run("places", async () => (q.length < 2 ? [] : maps.autocomplete({ input: q, ...(sessionToken && { sessionToken }) })));
        return;
      }
      if (route === "POST /api/trips") {
        void readBody(req).then((raw) => run("plan", () => handlePlan(raw)));
        return;
      }
      if (route === "GET /api/trips") {
        void run("trips", recentTrips);
        return;
      }
      const statusMatch = /^\/api\/trips\/([a-f0-9]{24})$/.exec(url.pathname);
      if (req.method === "GET" && statusMatch) {
        void run("status", () => tripStatus(statusMatch[1]));
        return;
      }
      if (route === "GET /") {
        const tripId = url.searchParams.get("trip") ?? startTrip;
        renderPage(tripId && ID.test(tripId) ? tripId : undefined)
          .then((page) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(page))
          .catch((err: unknown) => {
            console.error("[page]", err);
            res.writeHead(500, { "Content-Type": "text/plain" }).end("Could not load the trip.");
          });
        return;
      }
      res.writeHead(404).end();
    })
    .listen(PORT, "127.0.0.1", () => {
      console.log(`Demo at http://localhost:${PORT}${startTrip ? ` (trip ${startTrip})` : " (latest ready trip)"}`);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
