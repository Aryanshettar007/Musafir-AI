import { isValidObjectId } from "mongoose";
import type { LatLng } from "../../geo";
import { Place } from "../../models/place.model";
import { fromPoint, toPoint } from "../../models/point";
import { Story } from "../../models/story.model";
import { Trip } from "../../models/trip.model";
import type { ItemText, NearbyPlaceLike, TripLike } from "./askContext";

// Read-only database access for /ask. Nothing here writes.

export const NEARBY_RADIUS_M = 5_000;
const NEARBY_LIMIT = 8;

export interface LoadedTrip extends TripLike {
  language: string;
  voice: string;
}

// The user's own trip, or null (unknown id and someone else's trip look the same).
export async function loadTrip(uid: string, tripId: string): Promise<LoadedTrip | null> {
  if (!isValidObjectId(tripId)) return null;
  // Only what the context uses: not item audio, place ids or sponsor details.
  const trip = await Trip.findOne(
    { _id: tripId, userId: uid },
    {
      "destination.label": 1, route: 1, prefs: 1,
      "items.type": 1, "items.status": 1, "items.side": 1, "items.anchorRouteDistanceM": 1, "items.trigger.routeDistanceM": 1,
      "items.storyId": 1, "items.title": 1, "items.transcript": 1,
    },
  ).lean();
  if (!trip) return null;
  return {
    destinationLabel: trip.destination.label,
    route: { polyline: trip.route.polyline, distanceM: trip.route.distanceM, durationS: trip.route.durationS },
    items: trip.items,
    language: trip.prefs.language,
    voice: trip.prefs.voice,
  };
}

// Title and script of the stories behind trip items, keyed by story id.
export async function loadStoryTexts(storyIds: readonly string[]): Promise<Map<string, ItemText>> {
  const out = new Map<string, ItemText>();
  if (storyIds.length === 0) return out;
  const stories = await Story.find({ _id: { $in: storyIds } }, { title: 1, script: 1 }).lean();
  for (const s of stories) out.set(s._id.toString(), { title: s.title, text: s.script });
  return out;
}

// Places we already have facts for, within 5 km of the car, nearest first.
export async function loadNearbyPlaces(position: LatLng): Promise<NearbyPlaceLike[]> {
  const places = await Place.find(
    { location: { $near: { $geometry: toPoint(position), $maxDistance: NEARBY_RADIUS_M } } },
    { name: 1, kind: 1, location: 1, "facts.text": 1 },
  )
    .limit(NEARBY_LIMIT)
    .lean();
  return places.map((p) => ({ name: p.name, kind: p.kind, location: fromPoint(p.location), facts: p.facts?.text }));
}
