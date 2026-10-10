import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import type { GeminiClient } from "../../clients/gemini";
import type { GnaniService } from "../../clients/gnaniQueue";
import type { MapsClient } from "../../clients/maps";
import type { Storage } from "../../clients/storage";
import type { WikipediaClient } from "../../clients/wikipedia";
import { decodePolyline, indexRoute, type RouteIndex } from "../../geo";
import { Listen } from "../../models/listen.model";
import { Place } from "../../models/place.model";
import { toPoint } from "../../models/point";
import { Trip, type TripDoc } from "../../models/trip.model";
import { prepare, wikiKey, type Prepared } from "../../pipeline/candidates";
import { discover, type Discovery } from "../../pipeline/discover";
import { tripIntroFacts } from "../../pipeline/introFacts";
import { labelTokens } from "../../pipeline/match";
import { alternativesFor, finalizeItems, fitsSpacing, introItem, sponsoredItem } from "../../pipeline/plan";
import { INTRO_TRIGGER_RADIUS_M, ITEMS_IN_FLIGHT, TRIGGER_RADIUS_M } from "../../pipeline/rules";
import { avgSpeedMps, selectPicks, type Selection } from "../../pipeline/select";
import { triggerFor } from "../../pipeline/triggers";
import { countWords } from "../../pipeline/write";
import { placeKeysOf, type PlannedItem } from "../../pipeline/types";
import type { SponsorProvider } from "../sponsor/types";
import { createPlaceStore, type PlaceStore, type ResolvedItem } from "./placeStore";
import { createStoryProducer } from "./storyProducer";

export type TripRow = TripDoc & { _id: Types.ObjectId };
type ItemRow = TripRow["items"][number];

export type BuildEvent =
  | { kind: "stage"; tripId: string; stage: string; detail?: string; ms?: number }
  | { kind: "discovery"; tripId: string; discovery: Discovery }
  | { kind: "selection"; tripId: string; selection: Selection }
  | { kind: "item"; tripId: string; itemId: string; type: string; title: string; status: "ready" | "failed"; cached: boolean; ms: number; model?: string; words?: number; budget?: number; durationS?: number; wpm?: number; error?: string }
  | { kind: "warn"; tripId: string; message: string }
  | { kind: "finished"; tripId: string; status: "ready" | "failed"; ms: number };

export interface TripBuilderDeps {
  maps: MapsClient;
  wikipedia: WikipediaClient;
  gemini: GeminiClient;
  gnani: GnaniService;
  storage: Storage;
  sponsor?: SponsorProvider;
  onEvent?: (event: BuildEvent) => void;
  // Build lease (see claim()): how long a claim lasts without renewal, and this process's id. Defaults: 60 s, random.
  leaseMs?: number;
  owner?: string;
}

// What POST /trips needs from the builder (tests inject a fake).
export interface TripStarter {
  start(tripId: string): Promise<void>;
}

export interface TripBuilder extends TripStarter {
  // On startup: continue every trip left `building` by a restart. A trip another live process holds is retried when
  // that process's lease runs out.
  resumeAll(): Promise<number>;
  // Cancels scheduled retries (shutdown, tests). Builds already running finish on their own.
  stop(): void;
}

class BuildFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

// Another process took the trip over (our lease expired): stop quietly, the other process owns the outcome.
class LeaseLost extends Error {}

interface Lease {
  // Matches the trip only while this process holds it.
  owned: { _id: Types.ObjectId; "lease.owner": string };
  lost: boolean;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

function defaultLog(e: BuildEvent) {
  if (e.kind === "warn") console.warn(`[Trip ${e.tripId}] ${e.message}`);
  if (e.kind === "item" && e.status === "failed") console.error(`[Trip ${e.tripId}] item "${e.title}" failed: ${e.error}`);
}

export function createTripBuilder(deps: TripBuilderDeps): TripBuilder {
  const emit = deps.onEvent ?? defaultLog;
  const producer = createStoryProducer(deps);
  const running = new Map<string, Promise<void>>();
  const leaseMs = deps.leaseMs ?? 60_000;
  const owner = deps.owner ?? randomUUID();
  const retries = new Set<NodeJS.Timeout>();
  let stopped = false;

  async function discoverAndPlan(trip: TripRow, lease: Lease): Promise<void> {
    const tripId = String(trip._id);
    const warn = (message: string) => emit({ kind: "warn", tripId, message });
    const route = indexRoute(decodePolyline(trip.route.polyline));
    const v = avgSpeedMps(trip.route);

    let t = performance.now();
    let discovery: Discovery;
    try {
      discovery = await discover({ maps: deps.maps, wikipedia: deps.wikipedia, warn }, route);
    } catch (e) {
      throw new BuildFailure("DISCOVERY_FAILED", `Could not find places along the route: ${describe(e)}`);
    }
    emit({ kind: "discovery", tripId, discovery });
    emit({ kind: "stage", tripId, stage: "discovered", ms: Math.round(performance.now() - t), detail: `${discovery.google.length} Google places, ${discovery.wiki.length} Wikipedia articles` });
    await Trip.updateOne(lease.owned, { $set: { stage: "curating" } });

    t = performance.now();
    const prepared = prepare({
      route, google: discovery.google, wiki: discovery.wiki,
      originLabel: trip.origin.label, destinationLabel: trip.destination.label,
      heardKeys: await heardKeys(trip.userId),
    });
    const selection = await selectPicks(deps.gemini, { route, durationS: trip.route.durationS, prepared, interests: trip.prefs.interests });
    emit({ kind: "selection", tripId, selection });
    if (selection.picks.length === 0) throw new BuildFailure("NOTHING_BUILT", "Found nothing worth narrating along this route.");

    let sponsor: PlannedItem | undefined;
    if (deps.sponsor) {
      try {
        const spec = await deps.sponsor.sponsoredItemFor({ route, language: trip.prefs.language, voice: trip.prefs.voice, avgSpeedMps: v });
        if (spec) sponsor = sponsoredItem(spec);
      } catch (e) {
        warn(`sponsor lookup failed, trip continues without an ad: ${describe(e)}`);
      }
    }
    const items = finalizeItems(selection.picks, {
      intro: introItem(`${trip.origin.label} to ${trip.destination.label}`), sponsor, avgSpeedMps: v, totalM: route.totalM,
    });

    // Facts, now that the final items are known; an item that can't get facts is replaced from its slot or removed.
    const store = createPlaceStore({ wikipedia: deps.wikipedia, exclude: labelTokens(trip.origin.label, trip.destination.label), warn });
    const first = await store.resolveItems(items, prepared.towns);
    const resolved = await refill(first, { store, selection, items, interests: trip.prefs.interests, towns: prepared.towns, totalM: route.totalM, v, warn });
    if (!resolved.some((r) => !r.planned.locked)) throw new BuildFailure("NOTHING_BUILT", "No place along the route had facts to write from.");

    const docs = resolved.map(({ planned, keys }) => itemDoc(planned, keys.flatMap((k) => store.idOf(k) ?? []), route, v));
    const saved = await Trip.updateOne(lease.owned, { $set: { items: docs, stage: "producing" } });
    if (saved.matchedCount === 0) throw new LeaseLost();
    emit({ kind: "stage", tripId, stage: "planned", ms: Math.round(performance.now() - t), detail: `${docs.length} items (${selection.source}${selection.model ? `, ${selection.model}` : ""}), facts ${JSON.stringify(store.stats)}` });
  }

  // Spacing ran before facts were known, so an item dropped for lack of facts would leave a hole: try the same slot's
  // other shortlist entries (then its towns) that still fit the spacing. A few Wikipedia calls per dropped item at most.
  async function refill(
    first: { resolved: ResolvedItem[]; dropped: PlannedItem[] },
    ctx: {
      store: PlaceStore; selection: Selection; items: readonly PlannedItem[]; interests: TripRow["prefs"]["interests"];
      towns: Prepared["towns"]; totalM: number; v: number; warn: (m: string) => void;
    },
  ): Promise<ResolvedItem[]> {
    const out = [...first.resolved];
    const used = new Set(ctx.items.flatMap(placeKeysOf));
    for (const d of first.dropped) {
      let replacement: ResolvedItem | undefined;
      for (const alt of alternativesFor(d, ctx.selection.slots, used, ctx.interests, ctx.totalM)) {
        if (!fitsSpacing(alt, out.map((r) => r.planned), ctx.v)) continue;
        placeKeysOf(alt).forEach((k) => used.add(k));
        replacement = (await ctx.store.resolveItems([alt], ctx.towns)).resolved[0];
        if (replacement) break;
      }
      if (replacement) {
        out.push(replacement);
        ctx.warn(`replaced "${d.title}" (no Wikipedia facts for it or a town nearby) with "${replacement.planned.title}" from the same slot`);
      } else {
        ctx.warn(`dropped "${d.title}": no Wikipedia facts for it or a town nearby`);
      }
    }
    return out.sort((a, b) => a.planned.anchorRouteDistanceM - b.planned.anchorRouteDistanceM);
  }

  function itemDoc(p: PlannedItem, placeIds: Types.ObjectId[], route: RouteIndex, v: number) {
    const base = {
      _id: new Types.ObjectId(), type: p.type, placeIds, focus: p.focus, side: p.side, targetSeconds: Math.round(p.targetSeconds),
      anchorRouteDistanceM: Math.round(p.anchorRouteDistanceM), title: p.title,
    };
    if (p.type !== "sponsored" || !p.sponsor) return { ...base, status: "pending" as const };
    // A sponsored ad is already narrated: ready from the start.
    const s = p.sponsor;
    const trig = triggerFor(route, { anchorRouteDistanceM: s.anchorRouteDistanceM, durationS: s.audio.durationS, avgSpeedMps: v, radiusM: s.triggerRadiusM });
    return {
      ...base, status: "ready" as const, audio: s.audio, transcript: s.transcript, sponsor: { slug: s.sponsorSlug, name: s.sponsorName },
      trigger: { location: toPoint(trig.location), radiusM: trig.radiusM, routeDistanceM: Math.round(trig.routeDistanceM) },
    };
  }

  async function heardKeys(userId: string): Promise<Set<string>> {
    const ids = await Listen.distinct("placeIds", { userId, event: "completed" });
    if (ids.length === 0) return new Set();
    const places = await Place.find({ _id: { $in: ids } }, { googlePlaceId: 1, "wikipedia.pageId": 1 }).lean();
    return new Set(places.flatMap((p) => (p.googlePlaceId ? [p.googlePlaceId] : p.wikipedia ? [wikiKey(p.wikipedia.pageId)] : [])));
  }

  async function produceItem(trip: TripRow, item: ItemRow, route: RouteIndex, v: number): Promise<void> {
    const tripId = String(trip._id);
    const started = performance.now();
    const mark = (set: Record<string, unknown>) => Trip.updateOne({ _id: trip._id, "items._id": item._id }, { $set: set });
    try {
      const tripFacts = item.type === "trip-intro"
        ? tripIntroFacts({
            originLabel: trip.origin.label, destinationLabel: trip.destination.label, distanceM: trip.route.distanceM, durationS: trip.route.durationS,
            townNames: trip.items.filter((i) => i.type === "town-welcome").map((i) => i.title ?? ""),
            // The ad is not a place to announce.
            itemTitles: trip.items.filter((i) => i.type !== "trip-intro" && i.type !== "town-welcome" && i.type !== "sponsored").map((i) => i.title ?? "").filter(Boolean),
          })
        : undefined;
      const out = await producer.produce({
        tripId, type: item.type as Exclude<typeof item.type, "sponsored">, placeIds: item.placeIds, language: trip.prefs.language, voice: trip.prefs.voice,
        focus: item.focus, side: item.side, targetSeconds: item.targetSeconds, interests: trip.prefs.interests, tripFacts,
      });
      const trig = triggerFor(route, {
        anchorRouteDistanceM: item.anchorRouteDistanceM, durationS: out.story.audio.durationS, avgSpeedMps: v,
        radiusM: item.type === "trip-intro" ? INTRO_TRIGGER_RADIUS_M : TRIGGER_RADIUS_M,
      });
      await mark({
        "items.$.status": "ready", "items.$.storyId": out.story._id,
        "items.$.trigger": { location: toPoint(trig.location), radiusM: trig.radiusM, routeDistanceM: Math.round(trig.routeDistanceM) },
      });
      const durationS = out.story.audio.durationS;
      emit({
        kind: "item", tripId, itemId: String(item._id), type: item.type, title: out.story.title, status: "ready", cached: out.cached,
        ms: Math.round(performance.now() - started), model: out.detail?.model ?? out.story.models.llm, words: countWords(out.story.script),
        budget: out.detail?.budget, durationS, wpm: Math.round((countWords(out.story.script) / durationS) * 60),
      });
    } catch (e) {
      const error = describe(e).slice(0, 300);
      emit({ kind: "item", tripId, itemId: String(item._id), type: item.type, title: item.title ?? "", status: "failed", cached: false, ms: Math.round(performance.now() - started), error });
      await mark({ "items.$.status": "failed", "items.$.error": error }).catch((err) => emit({ kind: "warn", tripId, message: `could not mark item failed: ${describe(err)}` }));
    }
  }

  async function produceAll(tripId: Types.ObjectId, lease: Lease): Promise<void> {
    const trip = (await Trip.findById(tripId).lean()) as TripRow | null;
    if (!trip) return;
    const route = indexRoute(decodePolyline(trip.route.polyline));
    const v = avgSpeedMps(trip.route);
    const pending = trip.items.filter((i) => i.status === "pending").sort((a, b) => a.anchorRouteDistanceM - b.anchorRouteDistanceM);
    // Route order, two in flight: one item is written while another is narrated, so the first ones are ready quickly.
    let next = 0;
    await Promise.all(
      Array.from({ length: ITEMS_IN_FLIGHT }, async () => {
        while (next < pending.length && !lease.lost) await produceItem(trip, pending[next++], route, v);
      }),
    );
    if (lease.lost) throw new LeaseLost();
  }

  async function fail(lease: Lease, code: string, message: string) {
    await Trip.updateOne(lease.owned, { $set: { status: "failed", stage: "done", failure: { code, message } }, $unset: { lease: "" } });
  }

  // Two processes may both resume a trip at startup (or one restarts while the old one is still dying). A trip is
  // built only by the process holding its lease: claimable when it is still building and has no live lease of
  // another process. Returns the trip, or the other lease's expiry when another process holds it.
  async function claim(id: Types.ObjectId): Promise<{ trip: TripRow } | { heldUntil?: Date }> {
    const now = new Date();
    const trip = (await Trip.findOneAndUpdate(
      { _id: id, status: "building", $or: [{ lease: { $exists: false } }, { lease: null }, { "lease.expiresAt": { $lte: now } }, { "lease.owner": owner }] },
      { $set: { lease: { owner, expiresAt: new Date(now.getTime() + leaseMs) } } },
      { new: true, lean: true },
    )) as TripRow | null;
    if (trip) return { trip };
    const other = await Trip.findOne({ _id: id, status: "building" }, { lease: 1 }).lean();
    return { heldUntil: other?.lease?.expiresAt ?? undefined };
  }

  // If the holder dies, its lease runs out and this process takes over.
  function retryAt(tripId: string, when: Date) {
    if (stopped) return;
    const timer = setTimeout(() => {
      retries.delete(timer);
      void api.start(tripId);
    }, Math.max(0, when.getTime() - Date.now()) + 100);
    timer.unref();
    retries.add(timer);
  }

  async function run(tripId: string): Promise<void> {
    const started = performance.now();
    const id = new Types.ObjectId(tripId);
    let claimed: Awaited<ReturnType<typeof claim>>;
    try {
      claimed = await claim(id);
    } catch (e) {
      console.error(`[Trip ${tripId}] could not claim the build: ${describe(e)}`);
      return;
    }
    if (!("trip" in claimed)) {
      if (claimed.heldUntil) retryAt(tripId, claimed.heldUntil);
      return;
    }
    const lease: Lease = { owned: { _id: id, "lease.owner": owner }, lost: false };
    const heartbeat = setInterval(() => {
      Trip.updateOne(lease.owned, { $set: { "lease.expiresAt": new Date(Date.now() + leaseMs) } })
        .then((r) => {
          if (r.matchedCount === 0) lease.lost = true;
        })
        .catch((e: unknown) => emit({ kind: "warn", tripId, message: `could not renew the build lease: ${describe(e)}` }));
    }, Math.max(1, Math.floor(leaseMs / 3)));
    heartbeat.unref();
    try {
      let trip: TripRow | null = claimed.trip;
      if (trip.stage === "discovering" || trip.stage === "curating") {
        await discoverAndPlan(trip, lease);
      }
      await produceAll(id, lease);
      trip = (await Trip.findById(id).lean()) as TripRow | null;
      if (!trip) return;
      // The ad arrives ready-made and the intro only announces the others: a trip needs at least one place item.
      const ready = trip.items.filter((i) => i.status === "ready" && i.type !== "sponsored" && i.type !== "trip-intro").length;
      if (ready === 0) {
        await fail(lease, "NOTHING_BUILT", "No item could be built.");
        emit({ kind: "finished", tripId, status: "failed", ms: Math.round(performance.now() - started) });
        return;
      }
      await Trip.updateOne(lease.owned, { $set: { status: "ready", stage: "done", builtAt: new Date() }, $unset: { lease: "" } });
      emit({ kind: "finished", tripId, status: "ready", ms: Math.round(performance.now() - started) });
    } catch (e) {
      if (e instanceof LeaseLost) {
        emit({ kind: "warn", tripId, message: "another process took over this build" });
        return;
      }
      const failure = e instanceof BuildFailure ? e : new BuildFailure("BUILD_FAILED", describe(e));
      console.error(`[Trip ${tripId}] build failed (${failure.code}): ${failure.message}`);
      await fail(lease, failure.code, failure.message.slice(0, 300)).catch((err) => console.error(`[Trip ${tripId}] could not record failure: ${describe(err)}`));
      emit({ kind: "finished", tripId, status: "failed", ms: Math.round(performance.now() - started) });
    } finally {
      clearInterval(heartbeat);
    }
  }

  const api: TripBuilder = {
    // Resolves when the build is over (it never rejects: failures are written on the trip). POST /trips doesn't await it.
    start(tripId) {
      const existing = running.get(tripId);
      if (existing) return existing;
      const job = run(tripId).finally(() => running.delete(tripId));
      running.set(tripId, job);
      return job;
    },
    async resumeAll() {
      const building = await Trip.find({ status: "building" }, { _id: 1 }).lean();
      for (const t of building) void api.start(String(t._id));
      return building.length;
    },
    stop() {
      stopped = true;
      for (const timer of retries) clearTimeout(timer);
      retries.clear();
    },
  };
  return api;
}
