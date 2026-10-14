import { decodePolyline, haversineM, indexRoute, projectOntoRoute, type LatLng, type RouteIndex } from "../../geo";
import type { ItemType } from "../../models/trip.model";

// Pure context building for /ask: where the car is on the trip, what was just played and what is coming, nearby places,
// the conversation. Database reads live in askData.ts; the text produced here goes into the Gemini prompt.

export const MAX_HISTORY_TURNS = 6;
export const MAX_TURN_CHARS = 500;
const PREVIOUS_ITEMS = 2;
const NEXT_ITEMS = 3;
const ITEM_TEXT_CHARS = 300;
const PLACE_FACTS_CHARS = 600;
const OFF_ROUTE_NOTE_M = 2_000;

export interface Turn {
  q: string;
  a: string;
}

// The app sends the last few turns; only the most recent ones are used and each is cut to a sane length.
export function trimHistory(turns: readonly Turn[]): Turn[] {
  return turns.slice(-MAX_HISTORY_TURNS).map(({ q, a }) => ({ q: q.slice(0, MAX_TURN_CHARS), a: a.slice(0, MAX_TURN_CHARS) }));
}

export interface TripItemLike {
  type: ItemType;
  status: string;
  side: string;
  anchorRouteDistanceM: number;
  // Where playback starts (set when the item is ready); a story starts before the car reaches what it is about.
  trigger?: { routeDistanceM: number } | null;
  storyId?: { toString(): string } | null;
  title?: string | null;
  transcript?: string | null;
}

export interface TripLike {
  destinationLabel: string;
  route: { polyline: string; distanceM: number; durationS: number };
  items: readonly TripItemLike[];
}

export interface TripPosition {
  routeIndex: RouteIndex;
  doneM: number;
  remainingM: number;
  remainingMin: number;
  offRouteM: number;
}

export function locateOnTrip(trip: TripLike, position: LatLng): TripPosition {
  const routeIndex = indexRoute(decodePolyline(trip.route.polyline));
  const p = projectOntoRoute(routeIndex, position);
  const remainingM = Math.max(0, trip.route.distanceM - p.routeDistanceM);
  // Average speed over the whole route, so the estimate doesn't need live traffic.
  const speedMps = trip.route.durationS > 0 ? trip.route.distanceM / trip.route.durationS : 0;
  return {
    routeIndex,
    doneM: p.routeDistanceM,
    remainingM,
    remainingMin: speedMps > 0 ? Math.round(remainingM / speedMps / 60) : 0,
    offRouteM: p.distanceFromRouteM,
  };
}

const isContextItem = (i: TripItemLike) => i.status === "ready" && i.type !== "sponsored" && i.type !== "trip-intro";

// Where along the route the item starts playing (its anchor when no trigger is known).
const playsAtM = (i: TripItemLike) => i.trigger?.routeDistanceM ?? i.anchorRouteDistanceM;

// The last items already played and the next ones ahead. "Played" is by trigger, not anchor: the story about a fort
// 400 m ahead has usually just been told, and "what did you just say about it?" must find it under JUST PASSED.
export function pickNeighbours<T extends TripItemLike>(items: readonly T[], atM: number): { previous: T[]; next: T[] } {
  const usable = items.filter(isContextItem).sort((a, b) => playsAtM(a) - playsAtM(b));
  const previous = usable.filter((i) => playsAtM(i) <= atM).slice(-PREVIOUS_ITEMS);
  const next = usable.filter((i) => playsAtM(i) > atM).slice(0, NEXT_ITEMS);
  return { previous, next };
}

export interface ItemText {
  title?: string;
  text?: string;
}

const km = (m: number) => `${(Math.abs(m) / 1000).toFixed(1)} kilometres`;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}...` : text);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function describeItem(item: TripItemLike, atM: number, text: ItemText | undefined): string {
  const delta = item.anchorRouteDistanceM - atM;
  const where = `${item.side === "none" ? "on the road" : `${item.side} side`}, ${km(delta)} ${delta >= 0 ? "ahead" : "behind"}`;
  const title = text?.title ?? item.title ?? item.type;
  const body = text?.text ?? item.transcript ?? "";
  return `- [${item.type}] "${title}" (${where})${body ? `: ${clip(oneLine(body), ITEM_TEXT_CHARS)}` : ""}`;
}

export function formatTripContext(trip: TripLike, pos: TripPosition, texts: ReadonlyMap<string, ItemText>): string {
  const { previous, next } = pickNeighbours(trip.items, pos.doneM);
  const textOf = (i: TripItemLike) => (i.storyId ? texts.get(i.storyId.toString()) : undefined);
  const lines = [
    `TRIP: heading to ${trip.destinationLabel}. ${km(pos.doneM)} done, ${km(pos.remainingM)} remaining, about ${pos.remainingMin} minutes left at the average speed.`,
  ];
  if (pos.offRouteM > OFF_ROUTE_NOTE_M) lines.push(`The car is currently ${km(pos.offRouteM)} away from the planned route.`);
  lines.push("JUST PASSED (stories already played):");
  lines.push(...(previous.length ? previous.map((i) => describeItem(i, pos.doneM, textOf(i))) : ["- nothing yet"]));
  lines.push("COMING UP ON THE ROUTE:");
  lines.push(...(next.length ? next.map((i) => describeItem(i, pos.doneM, textOf(i))) : ["- nothing planned"]));
  return lines.join("\n");
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compassWord = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function formatPosition(position: LatLng, heading: number | undefined, hasTrip: boolean): string {
  const base = `POSITION: latitude ${position.lat.toFixed(4)}, longitude ${position.lng.toFixed(4)}.`;
  return !hasTrip && heading !== undefined ? `${base} The car is heading ${compassWord(heading)}.` : base;
}

export interface NearbyPlaceLike {
  name: string;
  kind: string;
  location: LatLng;
  facts?: string | null;
}

// Places from our database near the car (nearest first), with the side of the road when on a trip.
export function formatNearbyPlaces(places: readonly NearbyPlaceLike[], position: LatLng, route?: RouteIndex): string {
  if (places.length === 0) return "NEARBY PLACES FROM OUR DATABASE: none within five kilometres.";
  const lines = places.map((p) => {
    const dist = km(haversineM(position, p.location));
    const side = route ? `, ${projectOntoRoute(route, p.location).side} side of the road` : "";
    const facts = p.facts ? `: ${clip(oneLine(p.facts), PLACE_FACTS_CHARS)}` : "";
    return `- ${p.name} (${p.kind}, ${dist} away${side})${facts}`;
  });
  return `NEARBY PLACES FROM OUR DATABASE (within five kilometres):\n${lines.join("\n")}`;
}

export interface FoundPlace {
  name: string;
  location: LatLng;
  userRatingCount?: number;
}

// Google Places results for this one answer (never stored): name, rating count, distance and side.
// `area` = a town the passenger named: distance from the car and side of the road mean nothing there, so they're left out.
export function formatSearchResults(query: string, places: readonly FoundPlace[], position: LatLng, route?: RouteIndex, area?: string): string {
  if (places.length === 0) return `PLACES SEARCH "${query}": no results.`;
  const lines = places.map((p) => {
    const parts: string[] = [];
    if (!area) {
      parts.push(km(haversineM(position, p.location)) + " away");
      if (route) parts.push(`${projectOntoRoute(route, p.location).side} side of the road`);
    }
    if (p.userRatingCount !== undefined) parts.push(`${p.userRatingCount} reviews`);
    return parts.length > 0 ? `- ${p.name} (${parts.join(", ")})` : `- ${p.name}`;
  });
  return `PLACES SEARCH "${query}" (${area ? `in ${area}` : "near the car"}, from Google Maps):\n${lines.join("\n")}`;
}

// One line per utterance and no question markers, so app-sent text can't fake a prompt section.
const turnText = (text: string) => oneLine(text.replace(/<<<|>>>/g, " "));

export function formatHistory(history: readonly Turn[]): string {
  if (history.length === 0) return "";
  return `CONVERSATION SO FAR:\n${history.map((t) => `Passenger: ${turnText(t.q)}\nMusafir: ${turnText(t.a)}`).join("\n")}`;
}
