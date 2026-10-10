import { pointAtDistance, type LatLng, type RouteIndex } from "../geo";
import { TRIGGER_LEAD_FRACTION, TRIGGER_RADIUS_M } from "./rules";

export interface Trigger {
  location: LatLng;
  radiusM: number;
  routeDistanceM: number;
}

// The item should start playing early enough to finish about when the car reaches the anchor, with 30 % of the audio
// left to run past it: lead = speed x 0.3 x duration (trip spec 5.7). Needs the real audio duration.
export function triggerFor(
  route: RouteIndex,
  input: { anchorRouteDistanceM: number; durationS: number; avgSpeedMps: number; radiusM?: number },
): Trigger {
  const leadM = input.avgSpeedMps * TRIGGER_LEAD_FRACTION * input.durationS;
  const routeDistanceM = Math.max(0, input.anchorRouteDistanceM - leadM);
  return { location: pointAtDistance(route, routeDistanceM), radiusM: input.radiusM ?? TRIGGER_RADIUS_M, routeDistanceM };
}
