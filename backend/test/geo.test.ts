import { describe, expect, it } from "vitest";
import {
  decodePolyline,
  encodePolyline,
  haversineM,
  indexRoute,
  pointAtDistance,
  projectOntoRoute,
  routeBounds,
  sampleRoute,
  sliceRoute,
} from "../src/geo";

// Google's documented example: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
const GOOGLE_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

// A straight route heading north along 77.0 E, starting at 12 N, about 22 km long.
const north = indexRoute([
  { lat: 12.0, lng: 77.0 },
  { lat: 12.1, lng: 77.0 },
  { lat: 12.2, lng: 77.0 },
]);

describe("polyline", () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("encodes Google's reference example", () => {
    expect(encodePolyline(decodePolyline(GOOGLE_EXAMPLE))).toBe(GOOGLE_EXAMPLE);
  });

  it("round-trips arbitrary points to 5 decimals, including negatives and big jumps", () => {
    const points = [
      { lat: 12.97194, lng: 77.59369 },
      { lat: 12.97195, lng: 77.59371 },
      { lat: -33.86882, lng: 151.20929 },
      { lat: 0, lng: -0.00001 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });
});

describe("route geometry", () => {
  it("measures a degree of latitude as about 111 km", () => {
    expect(haversineM({ lat: 12, lng: 77 }, { lat: 13, lng: 77 })).toBeCloseTo(111_195, -2);
    expect(north.totalM).toBeCloseTo(2 * 11_119.5, -1);
  });

  it("puts a place east of a northbound route on the RIGHT and west on the LEFT", () => {
    const east = projectOntoRoute(north, { lat: 12.1, lng: 77.01 });
    const west = projectOntoRoute(north, { lat: 12.1, lng: 76.99 });
    expect(east.side).toBe("right");
    expect(west.side).toBe("left");
    expect(east.distanceFromRouteM).toBeCloseTo(1_088, -1);
    expect(east.routeDistanceM).toBeCloseTo(north.cumulativeM[1], -1);
    expect(east.closestPoint.lat).toBeCloseTo(12.1, 4);
  });

  it("ignores repeated vertices when choosing the side", () => {
    // A duplicate vertex is a zero-length segment with no direction; it must not decide the side.
    const dup = indexRoute([{ lat: 12.0, lng: 77.0 }, { lat: 12.1, lng: 77.0 }, { lat: 12.1, lng: 77.0 }, { lat: 12.2, lng: 77.0 }]);
    expect(projectOntoRoute(dup, { lat: 12.1, lng: 76.99 }).side).toBe("left");
    expect(projectOntoRoute(dup, { lat: 12.1, lng: 77.01 }).side).toBe("right");
    const stuck = indexRoute([{ lat: 12, lng: 77 }, { lat: 12, lng: 77 }]);
    expect(projectOntoRoute(stuck, { lat: 12.01, lng: 77 }).distanceFromRouteM).toBeCloseTo(1_112, -1);
  });

  it("refuses a non-positive sampling step instead of looping forever", () => {
    expect(() => sampleRoute(north, 0)).toThrow(/positive/);
  });

  it("flips sides when the route runs the other way", () => {
    const south = indexRoute([...north.points].reverse());
    expect(projectOntoRoute(south, { lat: 12.1, lng: 77.01 }).side).toBe("left");
  });

  it("clamps projection to the route ends", () => {
    const before = projectOntoRoute(north, { lat: 11.9, lng: 77.0 });
    expect(before.routeDistanceM).toBe(0);
    expect(before.distanceFromRouteM).toBeCloseTo(11_119, -2);
    expect(projectOntoRoute(north, { lat: 12.3, lng: 77.0 }).routeDistanceM).toBeCloseTo(north.totalM, 0);
  });

  it("finds the point at a distance along the route", () => {
    expect(pointAtDistance(north, 0)).toEqual({ lat: 12.0, lng: 77.0 });
    expect(pointAtDistance(north, north.cumulativeM[1])).toEqual({ lat: 12.1, lng: 77.0 });
    const mid = pointAtDistance(north, north.totalM * 0.75);
    expect(mid.lat).toBeCloseTo(12.15, 5);
    expect(pointAtDistance(north, -5)).toEqual(north.points[0]);
    expect(pointAtDistance(north, 1e9)).toEqual(north.points[2]);
  });

  it("samples every step plus the end", () => {
    const samples = sampleRoute(north, 5_000);
    expect(samples).toHaveLength(6); // 0, 5, 10, 15, 20 km + end (22.2 km)
    expect(samples[0]).toEqual(north.points[0]);
    expect(samples[5]).toEqual(north.points[2]);
  });

  it("slices the route between two distances, keeping the vertices in between", () => {
    const slice = sliceRoute(north, 5_000, 17_000);
    expect(slice).toHaveLength(3);
    expect(slice[1]).toEqual({ lat: 12.1, lng: 77.0 });
    expect(haversineM(slice[0], slice[2])).toBeCloseTo(12_000, -1);
    expect(sliceRoute(north, 17_000, 5_000)).toEqual(slice);
    expect(sliceRoute(north, 0, 1e9)).toEqual(north.points);
  });

  it("computes padded bounds", () => {
    const b = routeBounds(north, 1_000);
    expect(b.south).toBeCloseTo(12.0 - 1000 / 111_195, 4);
    expect(b.north).toBeCloseTo(12.2 + 1000 / 111_195, 4);
    expect(b.west).toBeLessThan(77.0);
    expect(b.east).toBeGreaterThan(77.0);
  });
});
