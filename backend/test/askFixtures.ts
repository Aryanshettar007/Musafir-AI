import { Place } from "../src/models/place.model";
import { Story } from "../src/models/story.model";
import { Trip } from "../src/models/trip.model";
import { toPoint } from "../src/models/point";
import { encodePolyline, haversineM, type LatLng } from "../src/geo";
import { putProfile } from "../src/services/user.service";

// A straight north-bound road from Srirangapatna-ish (12.40, 76.69) to (12.50, 76.69): about 11.1 km.
export const ROUTE_POINTS: LatLng[] = Array.from({ length: 11 }, (_, i) => ({ lat: 12.4 + i * 0.01, lng: 76.69 }));
export const ROUTE_M = ROUTE_POINTS.slice(1).reduce((sum, p, i) => sum + haversineM(ROUTE_POINTS[i], p), 0);
// Position 5.5 km along the road.
export const MID: LatLng = { lat: 12.45, lng: 76.69 };

export const makeProfile = (uid: string, input: Parameters<typeof putProfile>[1] = {}) => putProfile({ uid, email: `${uid}@example.com` }, input);

export async function makeTrip(userId: string, opts: { language?: "en-IN" | "kn-IN"; voice?: string } = {}) {
  const story = await Story.create({
    cacheKey: `k-${Math.random()}`, type: "story", language: "en-IN", voice: "Deepak", focus: "history", side: "left",
    title: "The old fort", script: "This fort was built long ago. ".repeat(30),
    audio: { storageKey: "stories/x.mp3", bytes: 1, durationS: 1 }, models: { llm: "m", tts: "t" }, promptVersion: 1,
  });
  const item = (type: string, anchorKm: number, extra: Record<string, unknown> = {}) => ({
    type, status: "ready", side: "right", targetSeconds: 60, anchorRouteDistanceM: anchorKm * 1000, ...extra,
  });
  const trip = await Trip.create({
    userId,
    status: "ready",
    stage: "done",
    origin: { label: "Start", location: toPoint(ROUTE_POINTS[0]) },
    destination: { label: "Mysuru", location: toPoint(ROUTE_POINTS[10]) },
    prefs: { language: opts.language ?? "en-IN", voice: opts.voice ?? "Deepak", voiceGender: "male", interests: ["history"], musicMode: "rj" },
    route: { polyline: encodePolyline(ROUTE_POINTS), distanceM: ROUTE_M, durationS: ROUTE_M / 20 },
    items: [
      item("trip-intro", 0),
      item("story", 1, { storyId: story._id, side: "left" }),
      item("food", 8, { title: "Hot idlis", transcript: "Stop for idli." }),
      item("sponsored", 6, { title: "Ad", transcript: "Buy things." }),
      // Starts playing at 5.2 km, before MID (5.5 km), although it is about a place at 7 km.
      item("story", 7, {
        title: "Bird sanctuary", transcript: "Birds. ".repeat(100),
        trigger: { location: toPoint({ lat: 12.452, lng: 76.69 }), radiusM: 300, routeDistanceM: 5_200 },
      }),
      item("town-welcome", 9, { title: "Welcome to Mysuru", transcript: "Welcome." }),
      item("story", 10, { title: "Palace", transcript: "A palace." }),
      item("story", 10.5, { title: "Pending one", status: "pending" }),
    ],
  });
  return trip;
}

export const makePlace = (name: string, at: LatLng, facts = `${name} is a famous place.`) =>
  Place.create({ kind: "poi", name, location: toPoint(at), facts: { text: facts, source: "wikipedia", fetchedAt: new Date() } });

export const answer = (text: string, extra: { missingData?: string; placesQuery?: string; placesArea?: string } = {}) => ({
  answer: text,
  missingData: extra.missingData ?? "none",
  ...(extra.placesQuery ? { placesQuery: extra.placesQuery } : {}),
  ...(extra.placesArea ? { placesArea: extra.placesArea } : {}),
});
