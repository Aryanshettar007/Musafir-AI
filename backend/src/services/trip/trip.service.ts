import { Types } from "mongoose";
import { z } from "zod";
import type { MapsClient } from "../../clients/maps";
import type { Storage } from "../../clients/storage";
import { decodePolyline, type LatLng } from "../../geo";
import { AppError, notFound } from "../../errors";
import { fromPoint, toPoint } from "../../models/point";
import { Story } from "../../models/story.model";
import { Trip, type TripDoc } from "../../models/trip.model";
import { User, type UserDoc } from "../../models/user.model";
import { ProfileInputSchema, resolveProfile, type Profile } from "../profile";
import type { Identity } from "../user.service";
import type { TripStarter } from "./tripBuilder";

export interface TripServiceDeps {
  maps: MapsClient;
  builder: TripStarter;
  storage: Storage;
  limits: { tripsPerDay: number; maxRouteKm: number };
  now?: () => Date;
}

const label = z.string().trim().min(1).max(100);
const placeId = z.string().trim().min(1).max(300);

export const CreateTripSchema = z.strictObject({
  origin: z.union([
    z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: label.default("Current location") }),
    z.strictObject({ placeId, label }),
  ]),
  destination: z.strictObject({ placeId, label }),
  // Same rules as PATCH /me, applied on top of the user's profile for this trip only.
  prefs: ProfileInputSchema.pick({ language: true, voiceGender: true, voice: true, interests: true, musicMode: true }).optional(),
});
export type CreateTripInput = z.infer<typeof CreateTripSchema>;

export const ListTripsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

const tripNotFound = () => notFound("TRIP_NOT_FOUND", "No such trip.");
const tripInProgress = (tripId: string | undefined) =>
  new AppError(409, "TRIP_IN_PROGRESS", "A trip is still being built. Wait for it to finish.", tripId ? { tripId } : undefined);
const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === 11000;
const ID = /^[a-f0-9]{24}$/i;

function profileOf(user: UserDoc): Profile {
  return {
    name: user.name ?? undefined,
    gender: user.gender,
    age: user.age ?? undefined,
    language: user.language,
    voiceGender: user.voiceGender,
    voice: user.voice,
    interests: user.interests,
    musicMode: user.musicMode,
  };
}

export function createTripService(deps: TripServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    // Validates, computes the route (synchronously, so routing errors come back at once), saves the trip as
    // `building` and hands it to the builder. Returns before anything is written.
    async createTrip(identity: Identity, input: CreateTripInput): Promise<{ tripId: string; status: "building" }> {
      const user = await User.findOne({ firebaseUid: identity.uid }).lean();
      if (!user) throw notFound("PROFILE_NOT_FOUND", "No profile yet. Finish onboarding with PUT /me.");
      // The profile itself is not changed: prefs apply to this trip only.
      const prefs = resolveProfile(profileOf(user), input.prefs ?? {});

      const building = await Trip.findOne({ userId: identity.uid, status: "building" }, { _id: 1 }).lean();
      if (building) throw tripInProgress(String(building._id));
      const since = new Date(now().getTime() - 24 * 3600_000);
      const recent = await Trip.countDocuments({ userId: identity.uid, createdAt: { $gte: since } });
      if (recent >= deps.limits.tripsPerDay) {
        throw new AppError(429, "TRIP_LIMIT_REACHED", `At most ${deps.limits.tripsPerDay} trips per day. Try again later.`);
      }

      const { origin, destination } = input;
      const route = await deps.maps.computeRoute({
        origin: "placeId" in origin ? { placeId: origin.placeId } : { lat: origin.lat, lng: origin.lng },
        destination: { placeId: destination.placeId },
      });
      if (!route) throw new AppError(422, "ROUTE_NOT_FOUND", "No drivable route between these places.");
      if (route.distanceM > deps.limits.maxRouteKm * 1000) {
        throw new AppError(422, "ROUTE_TOO_LONG", `Trips are limited to ${deps.limits.maxRouteKm} km; this route is ${Math.round(route.distanceM / 1000)} km.`);
      }

      // Waypoint locations come from the route's ends: Google snaps place ids to the road network.
      const points = decodePolyline(route.polyline);
      const first = points[0], last = points[points.length - 1];
      const trip = await Trip.create({
        userId: identity.uid,
        status: "building",
        stage: "discovering",
        origin: { label: origin.label, location: toPoint("placeId" in origin ? first : origin), ...("placeId" in origin ? { placeId: origin.placeId } : {}) },
        destination: { label: destination.label, location: toPoint(last), placeId: destination.placeId },
        prefs: { language: prefs.language, voice: prefs.voice, voiceGender: prefs.voiceGender, interests: prefs.interests, musicMode: prefs.musicMode },
        route: { polyline: route.polyline, distanceM: route.distanceM, durationS: route.durationS },
      }).catch(async (e: unknown) => {
        // A request that raced past the check above loses on the unique partial index (one building trip per user).
        if (!isDuplicateKey(e)) throw e;
        const winner = await Trip.findOne({ userId: identity.uid, status: "building" }, { _id: 1 }).lean();
        throw tripInProgress(winner ? String(winner._id) : undefined);
      });
      const tripId = String(trip._id);
      // Fire and forget: the builder records its own failures on the trip.
      Promise.resolve(deps.builder.start(tripId)).catch((e: unknown) => console.error(`[Trip ${tripId}] builder crashed:`, e));
      return { tripId, status: "building" };
    },

    // Only the owner can read a trip; anyone else gets TRIP_NOT_FOUND (no existence leak).
    async getTrip(identity: Identity, id: string) {
      if (!ID.test(id)) throw tripNotFound();
      const trip = await Trip.findOne({ _id: id, userId: identity.uid }).lean();
      if (!trip) throw tripNotFound();

      const storyIds = trip.items.flatMap((i) => (i.status === "ready" && i.storyId ? [i.storyId] : []));
      const stories = storyIds.length ? await Story.find({ _id: { $in: storyIds } }, { title: 1, script: 1, audio: 1 }).lean() : [];
      const byId = new Map(stories.map((s) => [String(s._id), s]));

      // URLs are signed on every call (S2): the database only holds storage keys.
      const items = await Promise.all(
        [...trip.items]
          .sort((a, b) => (a.trigger?.routeDistanceM ?? a.anchorRouteDistanceM) - (b.trigger?.routeDistanceM ?? b.anchorRouteDistanceM))
          .map(async (i) => {
            const story = i.storyId ? byId.get(String(i.storyId)) : undefined;
            const audio = i.status === "ready" ? (story?.audio ?? i.audio ?? undefined) : undefined;
            const loc = i.trigger ? fromPoint(i.trigger.location) : undefined;
            return {
              id: String(i._id),
              type: i.type,
              status: i.status,
              title: story?.title ?? i.title ?? undefined,
              side: i.side,
              ...(i.sponsor ? { sponsor: { name: i.sponsor.name } } : {}),
              ...(i.trigger && loc ? { trigger: { lat: loc.lat, lng: loc.lng, radiusM: i.trigger.radiusM, routeDistanceM: i.trigger.routeDistanceM } } : {}),
              ...(audio ? { audio: { url: await deps.storage.url(audio.storageKey), durationS: audio.durationS, bytes: audio.bytes } } : {}),
              ...(audio ? { transcript: story?.script ?? i.transcript ?? undefined } : {}),
            };
          }),
      );
      const origin = fromPoint(trip.origin.location), destination = fromPoint(trip.destination.location);
      return {
        id: String(trip._id),
        status: trip.status,
        ...(trip.failure ? { failure: { code: trip.failure.code, message: trip.failure.message } } : {}),
        progress: progressOf(trip.items),
        origin: { label: trip.origin.label, ...origin },
        destination: { label: trip.destination.label, ...destination },
        prefs: {
          language: trip.prefs.language, voice: trip.prefs.voice, voiceGender: trip.prefs.voiceGender,
          interests: trip.prefs.interests, musicMode: trip.prefs.musicMode,
        },
        route: { polyline: trip.route.polyline, distanceM: trip.route.distanceM, durationS: trip.route.durationS },
        items,
        totalBytes: items.reduce((sum, i) => sum + (i.audio?.bytes ?? 0), 0),
        createdAt: trip.createdAt.toISOString(),
        ...(trip.builtAt ? { builtAt: trip.builtAt.toISOString() } : {}),
      };
    },

    async listTrips(identity: Identity, limit: number) {
      const trips = await Trip.find({ userId: identity.uid }, { userId: 0, "items.placeIds": 0, "items.transcript": 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return trips.map((t) => ({
        id: String(t._id),
        status: t.status,
        progress: progressOf(t.items),
        origin: { label: t.origin.label },
        destination: { label: t.destination.label },
        route: { distanceM: t.route.distanceM, durationS: t.route.durationS },
        createdAt: t.createdAt.toISOString(),
      }));
    },
  };
}

export type TripService = ReturnType<typeof createTripService>;

function progressOf(items: TripDoc["items"]) {
  return {
    ready: items.filter((i) => i.status === "ready").length,
    failed: items.filter((i) => i.status === "failed").length,
    total: items.length,
  };
}

export type { LatLng };
