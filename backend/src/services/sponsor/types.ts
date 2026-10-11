import type { LanguageId } from "../../catalog/languages";
import type { RouteIndex } from "../../geo";

// The contract between the trip builder and the sponsored-ad feature. The builder depends on this interface only.
export interface SponsoredItemSpec {
  sponsorSlug: string;
  sponsorName: string;
  outletLabel: string;
  anchorRouteDistanceM: number;
  side: "left" | "right" | "none";
  title: string;
  audio: { storageKey: string; bytes: number; durationS: number };
  transcript: string;
  triggerRadiusM: number;
}

export interface SponsorProvider {
  // Called by the trip builder after selection, before production. Pure lookup + ad generation if missing.
  sponsoredItemFor(input: {
    route: RouteIndex;
    language: LanguageId;
    voice: string;
    avgSpeedMps: number;
  }): Promise<SponsoredItemSpec | null>;
}
