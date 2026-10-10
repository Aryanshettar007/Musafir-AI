// SPIKE (throwaway): route geometry helpers. These are the deterministic parts of design decision D3
// (side of road, distance from route, position along route) — candidates to become real src/geo code.

export interface LatLng {
  lat: number;
  lng: number;
}

// Google encoded polyline algorithm.
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0, shift = 0, byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Local flat projection (metres) around a reference point — accurate enough over a few km.
function toXY(p: LatLng, ref: LatLng) {
  return { x: rad(p.lng - ref.lng) * R * Math.cos(rad(ref.lat)), y: rad(p.lat - ref.lat) * R };
}

export interface RouteIndex {
  points: LatLng[];
  cumulativeM: number[]; // distance along route at each vertex
  totalM: number;
}

export function indexRoute(points: LatLng[]): RouteIndex {
  const cumulativeM = [0];
  for (let i = 1; i < points.length; i++) cumulativeM.push(cumulativeM[i - 1] + haversineM(points[i - 1], points[i]));
  return { points, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1] };
}

export interface Projection {
  distanceFromRouteM: number;
  routeDistanceM: number; // where along the route the place is closest
  side: "left" | "right";
  closestPoint: LatLng;
}

// Closest point on the route to `p`, and which side of the direction of travel it lies on.
export function projectOntoRoute(route: RouteIndex, p: LatLng): Projection {
  let best: Projection | undefined;
  const { points, cumulativeM } = route;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const B = toXY(b, a), P = toXY(p, a);
    const len2 = B.x * B.x + B.y * B.y;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
    const cx = t * B.x, cy = t * B.y;
    const d = Math.hypot(P.x - cx, P.y - cy);
    if (!best || d < best.distanceFromRouteM) {
      // Cross product > 0 => point is counter-clockwise from travel direction => left.
      const cross = B.x * P.y - B.y * P.x;
      best = {
        distanceFromRouteM: d,
        routeDistanceM: cumulativeM[i] + t * Math.sqrt(len2),
        side: cross > 0 ? "left" : "right",
        closestPoint: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      };
    }
  }
  return best!;
}

// Points every `stepM` metres along the route (for nearby / geosearch sampling).
export function sampleRoute(route: RouteIndex, stepM: number): LatLng[] {
  const out: LatLng[] = [];
  for (let target = 0; target <= route.totalM; target += stepM) {
    const i = route.cumulativeM.findIndex((c) => c >= target);
    out.push(route.points[Math.max(0, i)]);
  }
  out.push(route.points[route.points.length - 1]);
  return out;
}
