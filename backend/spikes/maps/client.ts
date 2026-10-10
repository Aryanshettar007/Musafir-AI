// SPIKE (throwaway): thin clients for Google Routes API, Places API (New) and Wikipedia geosearch.
import "dotenv/config";
import type { LatLng } from "./geo";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!KEY) throw new Error("GOOGLE_MAPS_API_KEY missing from backend/.env");

export const stats = { routes: 0, textSearch: 0, nearby: 0, wiki: 0 };

async function google<T>(url: string, fieldMask: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json as T;
}

export async function computeRoute(origin: string, destination: string) {
  stats.routes++;
  const r = await google<{ routes: Array<{ distanceMeters: number; duration: string; polyline: { encodedPolyline: string } }> }>(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    { origin: { address: origin }, destination: { address: destination }, travelMode: "DRIVE" },
  );
  const route = r.routes[0];
  return { distanceM: route.distanceMeters, durationS: parseInt(route.duration), polyline: route.polyline.encodedPolyline };
}

export interface GPlace {
  id: string;
  displayName?: { text: string };
  location: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  editorialSummary?: { text: string };
}

const PLACE_FIELDS = [
  "id", "displayName", "location", "primaryType", "types", "rating", "userRatingCount", "editorialSummary",
];

// Text Search along a route polyline; follows pagination (max 3 pages x 20 = 60).
export async function searchAlongRoute(textQuery: string, encodedPolyline: string, maxPages = 3): Promise<GPlace[]> {
  const all: GPlace[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    stats.textSearch++;
    const r = await google<{ places?: GPlace[]; nextPageToken?: string }>(
      "https://places.googleapis.com/v1/places:searchText",
      [...PLACE_FIELDS.map((f) => `places.${f}`), "nextPageToken"].join(","),
      { textQuery, pageSize: 20, searchAlongRouteParameters: { polyline: { encodedPolyline } }, ...(pageToken ? { pageToken } : {}) },
    );
    all.push(...(r.places ?? []));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

export async function searchNearby(center: LatLng, radiusM: number, includedTypes: string[]): Promise<GPlace[]> {
  stats.nearby++;
  const r = await google<{ places?: GPlace[] }>(
    "https://places.googleapis.com/v1/places:searchNearby",
    PLACE_FIELDS.map((f) => `places.${f}`).join(","),
    {
      includedTypes,
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
    },
  );
  return r.places ?? [];
}

export interface WikiHit {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

// Wikipedia articles near a point (max radius 10 km, max 500 results).
export async function wikiGeosearch(center: LatLng, radiusM = 10_000, limit = 100): Promise<WikiHit[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&format=json` +
    `&gscoord=${center.lat}|${center.lng}&gsradius=${Math.min(radiusM, 10_000)}&gslimit=${limit}`;
  for (let attempt = 1; ; attempt++) {
    stats.wiki++;
    const res = await fetch(url, { headers: { "User-Agent": WIKI_USER_AGENT } });
    const text = await res.text();
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok || !text.startsWith("{")) throw new Error(`Wikipedia ${res.status}: ${text.slice(0, 120)}`);
    return (JSON.parse(text) as { query?: { geosearch: WikiHit[] } }).query?.geosearch ?? [];
  }
}

// Wikimedia policy: generic user agents get 429'd; identify the app with a contact URL.
export const WIKI_USER_AGENT = "MusafirAI/0.1 (https://github.com/Aryanshettar007/Musafir-AI)";
