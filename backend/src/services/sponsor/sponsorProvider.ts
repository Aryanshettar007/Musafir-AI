import type { LatLng } from "../../geo";
import { Sponsor } from "../../models/sponsor.model";
import { fromPoint } from "../../models/point";
import { boxPolygon, corridorBoxes, inBoxes, matchOutlet, type OutletMatch } from "./outletMatching";
import type { SponsorAds } from "./sponsorAds";
import type { SponsorProvider } from "./types";

// The prefilter corridor is this wide on each side of the road, so a sponsor's maxDetourM is capped to it.
export const MAX_DETOUR_M = 5000;

// Finds the active sponsor whose outlet the route passes closest to and returns its (cached or freshly generated)
// ad. Never throws: any failure (database, Gemini, Gnani, storage) is logged and the trip just has no sponsored slot.
export function createSponsorProvider(deps: { ads: SponsorAds }): SponsorProvider {
  return {
    async sponsoredItemFor({ route, language, voice }) {
      try {
        if (route.points.length < 2) return null;
        const boxes = corridorBoxes(route, MAX_DETOUR_M);
        // Index-backed prefilter ($geoWithin with GeoJSON polygons uses the 2dsphere index; $box would not), then
        // exact projection in code.
        const sponsors = await Sponsor.find(
          {
            active: true,
            $or: boxes.map((b) => ({ "outlets.location": { $geoWithin: { $geometry: boxPolygon(b) } } })),
          },
          { ads: 0 },
        ).lean();

        let best: { slug: string; name: string; triggerRadiusM: number; match: OutletMatch<{ label: string; location: LatLng }> } | null = null;
        for (const s of sponsors) {
          const outlets = s.outlets
            .map((o) => ({ label: o.label, location: fromPoint(o.location) }))
            .filter((o) => inBoxes(o.location, boxes));
          const match = matchOutlet(route, outlets, { maxDetourM: Math.min(s.maxDetourM, MAX_DETOUR_M) });
          if (match && (!best || match.detourM < best.match.detourM)) {
            best = { slug: s.slug, name: s.name, triggerRadiusM: s.triggerRadiusM, match };
          }
        }
        if (!best) return null;

        const ad = await deps.ads.ensureAd(best.slug, language, voice);
        return {
          sponsorSlug: best.slug,
          sponsorName: best.name,
          outletLabel: best.match.outlet.label,
          anchorRouteDistanceM: best.match.anchorRouteDistanceM,
          side: best.match.side,
          title: ad.title,
          audio: { storageKey: ad.storageKey, bytes: ad.bytes, durationS: ad.durationS },
          transcript: ad.script,
          triggerRadiusM: best.triggerRadiusM,
        };
      } catch (err) {
        console.warn(`[sponsor] no sponsored item for ${language}/${voice}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  };
}
