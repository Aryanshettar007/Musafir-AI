// Builds a real trip from the command line against the real APIs (Maps, Wikipedia, Gemini, Gnani, MongoDB, bucket),
// or only runs discovery and saves it for fixtures. Usage:
//   npx tsx scripts/build-trip.ts --from "Bengaluru" --to "Mysore Palace" --language kn-IN --voice Girish
//   npx tsx scripts/build-trip.ts --from "Bengaluru" --to "Mumbai" --save-discovery test/fixtures/discovery-blr-mum.json
// Flags: --interests history,food   --user <uid> (default script-build-trip)   --resume <tripId>
//        --discovery-file <saved.json>  replays a saved discovery instead of calling Places and Wikipedia (route, Gemini,
//        Gnani, MongoDB and the bucket stay real), e.g. when the Places daily quota is used up
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { INTEREST_IDS, type InterestId } from "../src/catalog/interests";
import { LANGUAGE_IDS, type LanguageId } from "../src/catalog/languages";
import { geminiClient, type GeminiClient } from "../src/clients/gemini";
import { gnaniClient } from "../src/clients/gnani";
import { createGnaniQueue, type GnaniService } from "../src/clients/gnaniQueue";
import { mapsClient, type MapsClient } from "../src/clients/maps";
import { wikipediaClient, type WikipediaClient } from "../src/clients/wikipedia";
import { connectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { createStorage } from "../src/config/storage";
import { decodePolyline, haversineM, indexRoute, projectOntoRoute } from "../src/geo";
import { Trip } from "../src/models/trip.model";
import { poiKind } from "../src/pipeline/classify";
import { discover } from "../src/pipeline/discover";
import { DiscoveryFileSchema, toDiscoveryFile } from "../src/pipeline/discoveryFile";
import { rulesFor } from "../src/pipeline/rules";
import { createTripBuilder, createTripService, type BuildEvent } from "../src/services/trip";
import { createSponsorAds } from "../src/services/sponsor/sponsorAds";
import { createSponsorProvider } from "../src/services/sponsor/sponsorProvider";
import { putProfile } from "../src/services/user.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const counters = {
  maps: {} as Record<string, number>,
  wiki: {} as Record<string, number>,
  gemini: {} as Record<string, number>,
  geminiModels: {} as Record<string, number>,
  gnaniCalls: 0,
  gnaniChars: 0,
  gnaniMs: 0,
};
const bump = (o: Record<string, number>, k: string) => {
  o[k] = (o[k] ?? 0) + 1;
};

// Counting wrappers: cost counters for the report.
function countMaps(m: MapsClient): MapsClient {
  return {
    computeRoute: (r) => (bump(counters.maps, "routes"), m.computeRoute(r)),
    searchNearby: (r) => (bump(counters.maps, "nearby"), m.searchNearby(r)),
    searchText: (r) => (bump(counters.maps, "textSearch"), m.searchText(r)),
    autocomplete: (r) => (bump(counters.maps, "autocomplete"), m.autocomplete(r)),
  };
}
function countWiki(w: WikipediaClient): WikipediaClient {
  return {
    geosearch: (r) => (bump(counters.wiki, "geosearch"), w.geosearch(r)),
    searchByName: (r) => (bump(counters.wiki, "search"), w.searchByName(r)),
    extract: (r) => (bump(counters.wiki, "extract"), w.extract(r)),
  };
}
function countGemini(g: GeminiClient): GeminiClient {
  return {
    async generateJson(req) {
      const r = await g.generateJson(req);
      bump(counters.gemini, req.purpose);
      bump(counters.geminiModels, r.model);
      if (r.attempts > 1) bump(counters.gemini, `${req.purpose}-extra-attempts`);
      return r;
    },
  };
}
function countGnani(g: GnaniService): GnaniService {
  return {
    async tts(req, opts) {
      const t = performance.now();
      const out = await g.tts(req, opts);
      counters.gnaniCalls++;
      counters.gnaniChars += req.text.length;
      counters.gnaniMs += performance.now() - t;
      return out;
    },
    stt: (req, opts) => g.stt(req, opts),
  };
}

// Answers Nearby, Text and geosearch calls from a saved discovery, so the real discover() code runs without Places.
function replay(file: ReturnType<typeof DiscoveryFileSchema.parse>, maps: MapsClient): { maps: MapsClient; wikipedia: WikipediaClient } {
  return {
    maps: {
      ...maps,
      searchNearby: async ({ center, radiusM, maxResults = 20 }) =>
        file.google
          .filter((g) => poiKind(g.primaryType, g.types) === "poi" && haversineM(center, g.location) <= radiusM)
          .sort((a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0))
          .slice(0, maxResults),
      searchText: async ({ alongPolyline }) => {
        const route = alongPolyline ? indexRoute(decodePolyline(alongPolyline)) : undefined;
        return {
          places: file.google.filter((g) => poiKind(g.primaryType, g.types) === "food" && (!route || projectOntoRoute(route, g.location).distanceFromRouteM <= 5000)),
        };
      },
    },
    wikipedia: {
      geosearch: async ({ center, radiusM, limit }) => file.wiki.filter((w) => haversineM(center, w.location) <= radiusM).slice(0, limit),
      searchByName: async () => [],
      extract: async () => null,
    },
  };
}

const km = (m: number) => (m / 1000).toFixed(1);

async function main() {
  const from = arg("from"), to = arg("to");
  const resume = arg("resume");
  const saveDiscovery = arg("save-discovery");
  if (!resume && (!from || !to)) {
    throw new Error('Usage: build-trip.ts --from "Bengaluru" --to "Mysore Palace" [--language kn-IN --voice Girish --interests history,food] [--save-discovery file]');
  }

  const realMaps = mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY });
  const realWiki = wikipediaClient({ userAgent: env.WIKIPEDIA_USER_AGENT });
  const replayFile = arg("discovery-file");
  const replayed = replayFile ? replay(DiscoveryFileSchema.parse(JSON.parse(await readFile(replayFile, "utf8"))), realMaps) : undefined;
  const maps = countMaps(replayed?.maps ?? realMaps);
  // Facts always come from the real Wikipedia; only the discovery search is replayed.
  const wikipedia = countWiki(replayed ? { ...realWiki, geosearch: replayed.wikipedia.geosearch } : realWiki);
  const t0 = performance.now();

  if (saveDiscovery && from && to) {
    // Discovery stage only (no database, Gemini or Gnani): saves a trimmed fixture.
    const [o, d] = await Promise.all([maps.autocomplete({ input: from }), maps.autocomplete({ input: to })]);
    if (!o[0] || !d[0]) throw new Error("Autocomplete found no match for --from or --to");
    console.log(`origin: ${o[0].primaryText} | ${o[0].secondaryText}\ndestination: ${d[0].primaryText} | ${d[0].secondaryText}`);
    const route = await maps.computeRoute({ origin: { placeId: o[0].placeId }, destination: { placeId: d[0].placeId } });
    if (!route) throw new Error("No route");
    console.log(`route ${km(route.distanceM)} km, ${Math.round(route.durationS / 60)} min`);
    const rules = rulesFor(route.distanceM);
    console.log(`mode ${rules.mode}`);
    const discovery = await discover({ maps, wikipedia, warn: (m) => console.warn(`  warn: ${m}`) }, indexRoute(decodePolyline(route.polyline)), rules);
    const file = toDiscoveryFile({ originLabel: from, destinationLabel: to, route, discovery });
    const out = path.resolve(saveDiscovery);
    await writeFile(out, JSON.stringify(file));
    console.log(`discovery ${Math.round(performance.now() - t0)} ms: ${file.google.length} Google places, ${file.wiki.length} Wikipedia articles; stats ${JSON.stringify(discovery.stats)}`);
    console.log(`calls: maps ${JSON.stringify(counters.maps)}, wikipedia ${JSON.stringify(counters.wiki)}`);
    console.log(`saved ${out}`);
    return;
  }

  await connectDB();
  const gemini = countGemini(
    geminiClient({
      project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION,
      concurrency: env.GEMINI_CONCURRENCY, flashLanguages: env.GEMINI_FLASH_LANGUAGES,
    }),
  );
  const gnani = countGnani(createGnaniQueue(gnaniClient({ apiKeys: env.GNANI_API_KEYS })));
  const storage = createStorage(env);

  const rows: Array<Extract<BuildEvent, { kind: "item" }>> = [];
  const stageLog: string[] = [];
  const builder = createTripBuilder({
    maps, wikipedia, gemini, gnani, storage,
    // Same as the server: sponsored items (sample Corner House slot) join trips that pass an outlet.
    sponsor: createSponsorProvider({ ads: createSponsorAds({ gemini, gnani, storage }) }),
    onEvent(e) {
      if (e.kind === "stage") {
        stageLog.push(`${e.stage}: ${e.ms ?? "-"} ms ${e.detail ?? ""}`);
        console.log(`[stage] ${e.stage} ${e.ms ?? ""} ms ${e.detail ?? ""}`);
      }
      if (e.kind === "warn") console.warn(`[warn] ${e.message}`);
      if (e.kind === "selection") {
        const s = e.selection;
        console.log(`[curator] source=${s.source}${s.model ? ` model=${s.model}` : ""}${s.note ? ` note=${s.note}` : ""} picks=${s.picks.length} slots=${s.slots.length} (empty ${s.slots.filter((x) => x.candidates.length === 0 && x.towns.length === 0).length})`);
        for (const pick of s.picks) console.log(`  pick km ${km(pick.anchorRouteDistanceM).padStart(6)} ${pick.type.padEnd(12)} ${pick.focus.padEnd(11)} ${pick.title}`);
      }
      if (e.kind === "item") {
        rows.push(e);
        console.log(`[item] ${e.status} ${e.type.padEnd(12)} ${e.title.slice(0, 40).padEnd(40)} ${e.ms} ms ${e.cached ? "cached" : (e.model ?? "")} ${e.wpm ? `${e.wpm} wpm` : ""} ${e.error ?? ""}`);
      }
    },
  });

  let tripId = resume;
  if (tripId) {
    // An interrupted run may still hold the build lease (up to a minute); resuming by hand means taking it over now.
    await Trip.updateOne({ _id: tripId, status: "building" }, { $unset: { lease: "" } });
  }
  if (!tripId) {
    const uid = arg("user") ?? "script-build-trip";
    const language = (arg("language") ?? "en-IN") as LanguageId;
    if (!LANGUAGE_IDS.includes(language)) throw new Error(`Unknown language ${language}`);
    const interests = (arg("interests")?.split(",") ?? ["history", "food"]) as InterestId[];
    if (!interests.every((i) => INTEREST_IDS.includes(i))) throw new Error("Unknown interest");
    await putProfile({ uid }, { language, voice: arg("voice"), interests });
    const service = createTripService({ maps, builder, storage, limits: { tripsPerDay: 1000, maxRouteKm: env.MAX_ROUTE_KM } });
    const [o, d] = await Promise.all([maps.autocomplete({ input: from! }), maps.autocomplete({ input: to! })]);
    if (!o[0] || !d[0]) throw new Error("Autocomplete found no match for --from or --to");
    // A previous run may have left a building trip; the script's user may only have one.
    await Trip.updateMany({ userId: uid, status: "building" }, { $set: { status: "failed", failure: { code: "ABANDONED", message: "superseded by a script run" } } });
    const created = await service.createTrip({ uid }, { origin: { placeId: o[0].placeId, label: from! }, destination: { placeId: d[0].placeId, label: to! } });
    tripId = created.tripId;
    console.log(`trip ${tripId} created (${Math.round(performance.now() - t0)} ms to route)`);
  }
  const started = performance.now();
  await builder.start(tripId);
  const wall = Math.round(performance.now() - started);

  const trip = await Trip.findById(tripId).lean();
  if (!trip) throw new Error("Trip vanished");
  console.log(`\n=== trip ${tripId}: ${trip.status}${trip.failure ? ` ${trip.failure.code}: ${trip.failure.message}` : ""}; build ${wall} ms; ${km(trip.route.distanceM)} km, ${Math.round(trip.route.durationS / 60)} min`);
  const byId = new Map(rows.map((r) => [r.itemId, r]));
  const order = (i: (typeof trip.items)[number]) => i.trigger?.routeDistanceM ?? i.anchorRouteDistanceM;
  for (const i of [...trip.items].sort((a, b) => order(a) - order(b))) {
    const r = byId.get(String(i._id));
    console.log(
      `  ${i.status.padEnd(7)} ${i.type.padEnd(12)} anchor ${km(i.anchorRouteDistanceM).padStart(6)} km  trigger ${i.trigger ? km(i.trigger.routeDistanceM).padStart(6) : "     -"} km  ${i.side.padEnd(5)} ${i.focus.padEnd(12)} ${(i.title ?? "").slice(0, 36).padEnd(36)} ${r?.cached ? "cached" : (r?.model ?? "")} ${r?.wpm ? `${r.wpm}wpm ${r.durationS?.toFixed(0)}s` : ""}${i.error ? ` ERR ${i.error}` : ""}`,
    );
  }
  const wpms = rows.flatMap((r) => (r.wpm && !r.cached ? [r.wpm] : []));
  if (wpms.length) console.log(`words per minute (new stories): avg ${Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length)}, min ${Math.min(...wpms)}, max ${Math.max(...wpms)}`);
  console.log(`counters: ${JSON.stringify(counters)}`);
  console.log(`stages: ${stageLog.join(" | ")}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
