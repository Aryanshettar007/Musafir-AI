import type { LatLng } from "./polyline";

// Route geometry is code, not model output (design decision D3): side of the road, distance from the route and
// position along it all come from here.
const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Local flat projection (metres) around a reference point, accurate enough over a few km.
function toXY(p: LatLng, ref: LatLng) {
  return { x: rad(p.lng - ref.lng) * R * Math.cos(rad(ref.lat)), y: rad(p.lat - ref.lat) * R };
}

export interface RouteIndex {
  points: LatLng[];
  cumulativeM: number[]; // distance along the route at each vertex
  totalM: number;
}

export function indexRoute(points: LatLng[]): RouteIndex {
  const cumulativeM = [0];
  for (let i = 1; i < points.length; i++) cumulativeM.push(cumulativeM[i - 1] + haversineM(points[i - 1], points[i]));
  return { points, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1] ?? 0 };
}

export interface Projection {
  distanceFromRouteM: number;
  routeDistanceM: number; // where along the route the place is closest
  side: "left" | "right";
  closestPoint: LatLng;
}

// Closest point on the route to `p`, and which side of the direction of travel it lies on.
export function projectOntoRoute(route: RouteIndex, p: LatLng): Projection {
  const { points, cumulativeM } = route;
  if (points.length === 0) throw new Error("Cannot project onto an empty route");
  let best: Projection | undefined;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const B = toXY(b, a), P = toXY(p, a);
    const len2 = B.x * B.x + B.y * B.y;
    // Repeated vertices (common in decoded polylines) have no direction, so they can't tell left from right; the
    // neighbouring segments cover the same point.
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
    const d = Math.hypot(P.x - t * B.x, P.y - t * B.y);
    if (!best || d < best.distanceFromRouteM) {
      // Cross product > 0 means the point is counter-clockwise from the travel direction, i.e. on the left.
      const cross = B.x * P.y - B.y * P.x;
      best = {
        distanceFromRouteM: d,
        routeDistanceM: cumulativeM[i] + t * Math.sqrt(len2),
        side: cross > 0 ? "left" : "right",
        closestPoint: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      };
    }
  }
  // A single point, or every vertex the same: no direction of travel.
  return best ?? { distanceFromRouteM: haversineM(points[0], p), routeDistanceM: 0, side: "right", closestPoint: points[0] };
}

// The route point `m` metres from the start (clamped to the route).
export function pointAtDistance(route: RouteIndex, m: number): LatLng {
  const { points, cumulativeM, totalM } = route;
  if (points.length === 0) throw new Error("Empty route");
  if (m <= 0 || points.length === 1) return points[0];
  if (m >= totalM) return points[points.length - 1];
  // First vertex at or beyond m (binary search; routes have tens of thousands of vertices).
  let lo = 1, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeM[mid] >= m) hi = mid;
    else lo = mid + 1;
  }
  const a = points[lo - 1], b = points[lo];
  const span = cumulativeM[lo] - cumulativeM[lo - 1];
  const t = span === 0 ? 0 : (m - cumulativeM[lo - 1]) / span;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// Points every `stepM` metres along the route (for nearby / geosearch sampling), including the end.
export function sampleRoute(route: RouteIndex, stepM: number): LatLng[] {
  if (!(stepM > 0)) throw new Error(`sampleRoute: stepM must be positive, got ${stepM}`);
  const out: LatLng[] = [];
  for (let m = 0; m < route.totalM; m += stepM) out.push(pointAtDistance(route, m));
  out.push(pointAtDistance(route, route.totalM));
  return out;
}

// The part of the route between two distances, as a polyline (for per-segment searches).
export function sliceRoute(route: RouteIndex, fromM: number, toM: number): LatLng[] {
  const from = Math.max(0, Math.min(fromM, toM)), to = Math.min(route.totalM, Math.max(fromM, toM));
  const out: LatLng[] = [pointAtDistance(route, from)];
  for (let i = 0; i < route.points.length; i++) {
    if (route.cumulativeM[i] > from && route.cumulativeM[i] < to) out.push(route.points[i]);
  }
  out.push(pointAtDistance(route, to));
  return out;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

// Bounding box of the route, padded by `padM` on every side.
export function routeBounds(route: RouteIndex, padM = 0): Bounds {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of route.points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  const dLat = (padM / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad((south + north) / 2));
  return { south: south - dLat, north: north + dLat, west: west - dLng, east: east + dLng };
}
