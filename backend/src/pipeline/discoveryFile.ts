import { z } from "zod";
import type { Discovery } from "./discover";

const LatLng = z.object({ lat: z.number(), lng: z.number() });

// A saved discovery run (trimmed to what match, filter and selection need). Used for test fixtures and for tuning
// selection without API calls (scripts/preview-selection.ts).
export const DiscoveryFileSchema = z.object({
  origin: z.object({ label: z.string() }),
  destination: z.object({ label: z.string() }),
  route: z.object({ polyline: z.string(), distanceM: z.number(), durationS: z.number() }),
  google: z.array(
    z.object({
      id: z.string(), name: z.string(), location: LatLng, primaryType: z.string().optional(),
      types: z.array(z.string()), userRatingCount: z.number().optional(),
    }),
  ),
  wiki: z.array(
    z.object({
      pageId: z.number(), title: z.string(), location: LatLng, description: z.string().optional(),
      length: z.number().optional(), wikidataId: z.string().optional(),
    }),
  ),
  stats: z.object({ nearby: z.number(), nearbySplits: z.number(), textSearch: z.number(), wikipedia: z.number(), failedCalls: z.number() }),
});
export type DiscoveryFile = z.infer<typeof DiscoveryFileSchema>;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function toDiscoveryFile(input: {
  originLabel: string;
  destinationLabel: string;
  route: DiscoveryFile["route"];
  discovery: Discovery;
}): DiscoveryFile {
  const ll = (p: { lat: number; lng: number }) => ({ lat: round5(p.lat), lng: round5(p.lng) });
  return {
    origin: { label: input.originLabel },
    destination: { label: input.destinationLabel },
    route: input.route,
    google: input.discovery.google.map((g) => ({
      id: g.id, name: g.name, location: ll(g.location), ...(g.primaryType ? { primaryType: g.primaryType } : {}),
      types: g.types, ...(g.userRatingCount !== undefined ? { userRatingCount: g.userRatingCount } : {}),
    })),
    wiki: input.discovery.wiki.map((w) => ({
      pageId: w.pageId, title: w.title, location: ll(w.location),
      ...(w.description ? { description: w.description } : {}), ...(w.length !== undefined ? { length: w.length } : {}),
      ...(w.wikidataId ? { wikidataId: w.wikidataId } : {}),
    })),
    stats: input.discovery.stats,
  };
}
