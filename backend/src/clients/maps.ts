import { z } from "zod";
import type { LatLng } from "../geo/polyline";
import { asUpstreamError, fetchWithTimeout, isRetryableStatus, parseRetryAfter, UpstreamError, withRetry } from "./upstream";

export type { LatLng };

export interface GPlace {
  id: string;
  name: string;
  location: LatLng;
  primaryType?: string;
  types: string[];
  userRatingCount?: number;
}

type Waypoint = LatLng | { placeId: string };

export interface RouteOption {
  id: string;
  distanceM: number;
  durationS: number;
  description: string;
  polyline: string;
}

export interface MapsClient {
  // null = Google found no drivable route.
  computeRoute(req: { origin: Waypoint; destination: Waypoint }): Promise<{ distanceM: number; durationS: number; polyline: string } | null>;
  computeRoutes(req: { origin: Waypoint; destination: Waypoint }): Promise<RouteOption[]>;
  searchNearby(req: { center: LatLng; radiusM: number; includedTypes: string[]; maxResults?: number }): Promise<GPlace[]>;
  searchText(req: {
    query: string;
    alongPolyline?: string;
    bias?: { center: LatLng; radiusM: number };
    pageSize?: number;
    pageToken?: string;
  }): Promise<{ places: GPlace[]; nextPageToken?: string }>;
  autocomplete(req: { input: string; bias?: LatLng; sessionToken?: string }): Promise<
    Array<{ placeId: string; primaryText: string; secondaryText: string }>
  >;
}

// The X-Goog-FieldMask header is mandatory and sets the billing SKU: ask only for what we use (no rating or
// editorialSummary, which move the call to a pricier SKU).
const PLACE_FIELDS = ["id", "displayName", "location", "primaryType", "types", "userRatingCount"].map((f) => `places.${f}`);
const ROUTE_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description";

const RawPlace = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  primaryType: z.string().optional(),
  types: z.array(z.string()).optional(),
  userRatingCount: z.number().optional(),
});

const PlacesResponse = z.object({ places: z.array(RawPlace).optional(), nextPageToken: z.string().optional() });

const RoutesResponse = z.object({
  routes: z
    .array(
      z.object({
        distanceMeters: z.number().optional(),
        duration: z.string(),
        description: z.string().optional(),
        polyline: z.object({ encodedPolyline: z.string() }),
      })
    )
    .optional(),
});

const AutocompleteResponse = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }).optional(),
            structuredFormat: z
              .object({
                mainText: z.object({ text: z.string() }),
                secondaryText: z.object({ text: z.string() }).optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const toGPlace = (p: z.infer<typeof RawPlace>): GPlace => ({
  id: p.id,
  name: p.displayName?.text ?? "",
  location: { lat: p.location.latitude, lng: p.location.longitude },
  primaryType: p.primaryType,
  types: p.types ?? [],
  userRatingCount: p.userRatingCount,
});

const latLng = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });
const waypoint = (w: Waypoint) => ("placeId" in w ? { placeId: w.placeId } : { location: { latLng: latLng(w) } });
const circle = (center: LatLng, radius: number) => ({ circle: { center: latLng(center), radius } });

const TIMEOUT_MS = 30_000;
// Nearby Search and each Text Search page return at most 20 places; larger values are a 400.
const clampResults = (n: number) => Math.max(1, Math.min(20, Math.floor(n)));
const RETRY = { attempts: 4, baseDelayMs: 500 };

export function mapsClient(cfg: { apiKey: string }): MapsClient {
  // One POST with timeout, retry on 429/5xx, and zod validation of the fields we read.
  async function post<T>(url: string, fieldMask: string | undefined, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return withRetry(async () => {
      let res: Response;
      let text: string;
      try {
        res = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": cfg.apiKey,
            ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
          },
          body: JSON.stringify(body),
          timeoutMs: TIMEOUT_MS,
        });
        // The timeout also covers reading the body, so this read can abort too (reported as retryable).
        text = await res.text();
      } catch (e) {
        throw asUpstreamError("maps", e);
      }
      const path = new URL(url).pathname;
      if (!res.ok) {
        // Google's error JSON can echo request details; keep only its message, never the key.
        const message = safeMessage(text);
        // A daily quota ("... requests per day", quota_limit "...PerDay...") won't clear within our retries: fail now
        // instead of burning four attempts (same rule as the Gemini client).
        const retryable = isRetryableStatus(res.status) && !isDailyQuota(text);
        throw new UpstreamError("maps", res.status, `Google Maps ${path} failed with ${res.status}: ${message}`,
          retryable, parseRetryAfter(res.headers.get("retry-after")));
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new UpstreamError("maps", res.status, `Google Maps ${path} returned a body that is not JSON`, false);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new UpstreamError("maps", res.status, `Google Maps ${path} returned an unexpected response: ${parsed.error.message.slice(0, 200)}`, false);
      return parsed.data;
    }, RETRY);
  }

  return {
    async computeRoutes({ origin, destination }) {
      const r = await post(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        ROUTE_MASK,
        {
          origin: waypoint(origin),
          destination: waypoint(destination),
          travelMode: "DRIVE",
          computeAlternativeRoutes: true,
        },
        RoutesResponse,
      );
      if (!r.routes || r.routes.length === 0) return [];
      return r.routes.map((route, idx) => ({
        id: `route_${idx}`,
        distanceM: route.distanceMeters ?? 0,
        durationS: parseInt(route.duration, 10),
        description: route.description || (idx === 0 ? "Fastest route" : `Alternative route ${idx}`),
        polyline: route.polyline.encodedPolyline,
      }));
    },

    async computeRoute({ origin, destination }) {
      const r = await post(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        ROUTE_MASK,
        { origin: waypoint(origin), destination: waypoint(destination), travelMode: "DRIVE" },
        RoutesResponse,
      );
      const route = r.routes?.[0];
      if (!route) return null;
      return {
        distanceM: route.distanceMeters ?? 0,
        durationS: parseInt(route.duration, 10),
        polyline: route.polyline.encodedPolyline,
      };
    },

    async searchNearby({ center, radiusM, includedTypes, maxResults = 20 }) {
      const r = await post(
        "https://places.googleapis.com/v1/places:searchNearby",
        PLACE_FIELDS.join(","),
        {
          includedTypes,
          maxResultCount: clampResults(maxResults),
          rankPreference: "POPULARITY",
          locationRestriction: circle(center, radiusM),
        },
        PlacesResponse,
      );
      return (r.places ?? []).map(toGPlace);
    },

    async searchText({ query, alongPolyline, bias, pageSize = 20, pageToken }) {
      const r = await post(
        "https://places.googleapis.com/v1/places:searchText",
        [...PLACE_FIELDS, "nextPageToken"].join(","),
        {
          textQuery: query,
          pageSize: clampResults(pageSize),
          ...(alongPolyline ? { searchAlongRouteParameters: { polyline: { encodedPolyline: alongPolyline } } } : {}),
          ...(bias ? { locationBias: circle(bias.center, bias.radiusM) } : {}),
          ...(pageToken ? { pageToken } : {}),
        },
        PlacesResponse,
      );
      return { places: (r.places ?? []).map(toGPlace), nextPageToken: r.nextPageToken };
    },

    async autocomplete({ input, bias, sessionToken }) {
      const r = await post(
        "https://places.googleapis.com/v1/places:autocomplete",
        undefined,
        {
          input,
          includedRegionCodes: ["in"],
          ...(bias ? { locationBias: circle(bias, 50_000) } : {}),
          ...(sessionToken ? { sessionToken } : {}),
        },
        AutocompleteResponse,
      );
      return (r.suggestions ?? [])
        .flatMap((s) => (s.placePrediction ? [s.placePrediction] : []))
        .slice(0, 5)
        .map((p) => ({
          placeId: p.placeId,
          primaryText: p.structuredFormat?.mainText.text ?? p.text?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        }));
    },
  };
}

export const isDailyQuota = (body: string) => /per\s*day/i.test(body);

function safeMessage(body: string): string {
  try {
    const parsed = z.object({ error: z.object({ message: z.string().optional() }).optional() }).parse(JSON.parse(body));
    return parsed.error?.message ?? "no details";
  } catch {
    return body.slice(0, 120);
  }
}
