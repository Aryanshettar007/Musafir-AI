import { indexRoute, projectOntoRoute, routeBounds, sliceRoute, type Bounds, type LatLng, type RouteIndex } from "../../geo";

// Outlets in the first stretch of the route are ignored: the trip intro and the first stories play there.
export const MIN_ANCHOR_M = 2000;
// Closer than this to the route line the outlet is "on the road", so left/right is meaningless.
const ON_ROUTE_M = 50;
// Length of route covered by one prefilter box. One box around a long diagonal route (Bengaluru -> Mumbai) would
// cover a huge area; boxes per slice hug the road.
const CORRIDOR_SLICE_M = 25_000;

export interface OutletCandidate {
  label: string;
  location: LatLng;
}

export interface OutletMatch<T extends OutletCandidate> {
  outlet: T;
  anchorRouteDistanceM: number;
  detourM: number;
  side: "left" | "right" | "none";
}

// Boxes covering every point within `padM` of the route, one per ~25 km slice. Used as the database prefilter
// (index-backed) and to skip projecting outlets that are obviously far away.
export function corridorBoxes(route: RouteIndex, padM: number): Bounds[] {
  if (route.points.length === 0) return [];
  const boxes: Bounds[] = [];
  for (let from = 0; from < route.totalM || boxes.length === 0; from += CORRIDOR_SLICE_M) {
    boxes.push(routeBounds(indexRoute(sliceRoute(route, from, from + CORRIDOR_SLICE_M)), padM));
  }
  return boxes;
}

export const inBoxes = (p: LatLng, boxes: readonly Bounds[]) =>
  boxes.some((b) => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east);

// GeoJSON polygon of a box. Edges are geodesics, not parallels, but over a ~30 km box the difference is metres,
// far inside the padding.
export function boxPolygon(b: Bounds): { type: "Polygon"; coordinates: number[][][] } {
  return {
    type: "Polygon",
    coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
  };
}

// The outlet the route passes closest to (within maxDetourM), ignoring outlets that sit in the first 2 km.
export function matchOutlet<T extends OutletCandidate>(
  route: RouteIndex,
  outlets: readonly T[],
  opts: { maxDetourM: number; minAnchorM?: number },
): OutletMatch<T> | null {
  const minAnchorM = opts.minAnchorM ?? MIN_ANCHOR_M;
  let best: OutletMatch<T> | null = null;
  for (const outlet of outlets) {
    const proj = projectOntoRoute(route, outlet.location);
    if (proj.distanceFromRouteM > opts.maxDetourM) continue;
    if (proj.routeDistanceM < minAnchorM) continue;
    if (!best || proj.distanceFromRouteM < best.detourM) {
      best = {
        outlet,
        anchorRouteDistanceM: proj.routeDistanceM,
        detourM: proj.distanceFromRouteM,
        side: proj.distanceFromRouteM < ON_ROUTE_M ? "none" : proj.side,
      };
    }
  }
  return best;
}
