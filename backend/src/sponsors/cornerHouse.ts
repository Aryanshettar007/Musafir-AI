// SAMPLE SPONSORED SLOT for the demo. Corner House Ice Creams has no deal with Musafir; this shows how a local
// business would appear on a trip. Seeded by scripts/seed-sponsor.ts.
//
// Outlets: found 2026-10-11 with scripts/find-sponsor-outlets.ts (Places Text Search "Corner House Ice Cream" along
// the real Bengaluru -> Mysore Palace route, 141 km, plus a search near Mysuru). All central-Bengaluru outlets are
// 0 to 6 km along the route and 0.6 km or more off it (and the first 2 km is excluded), so they are not used. The
// two Mysuru outlets are the only ones the highway really passes:
//   - V.V. Mohalla: 138.2 km along the route, 2.5 km off it, on the right.
//   - Kuvempu Nagar: 140.4 km along, 2.9 km off, on the right.
// The provider picks the smaller detour (V.V. Mohalla).
//
// Brief sources (only facts used by the ad): Corner House began in 1982 in Bengaluru; its "Death By Chocolate"
// sundae and hot chocolate fudge are its best known dessert; it has a Mysuru outlet.
// https://citizenmatters.in/1998-corner-house-founder-a-narayan-rao/
// https://homegrown.co.in/homegrown-explore/a-bengaluru-gem-how-corner-house-ice-creams-shaped-the-citys-culture
// https://thebetterindia.com/web-stories/corner-house-bengaluru-death-by-chocolate-story
// Keep the brief free of claims that were not verified there (no prices, awards or outlet counts).
import type { SponsorSeed } from "../models/sponsor.model";

export const CORNER_HOUSE: SponsorSeed = {
  slug: "corner-house",
  name: "Corner House Ice Creams",
  active: true,
  brief: {
    tagline: "A famous Bengaluru ice cream parlour",
    highlights: [
      "Started in Bengaluru in 1982",
      "Best known for the Death By Chocolate sundae, a big, rich chocolate dessert",
      "Also known for its hot chocolate fudge",
      "Has an outlet in Mysuru",
    ],
    callToAction: "Stop by for an ice cream in Mysuru",
  },
  outlets: [
    {
      label: "Corner House, V.V. Mohalla, Mysuru",
      googlePlaceId: "ChIJ0z9tQpt6rzsRlcsg-qSSrUs",
      location: { type: "Point", coordinates: [76.63495, 12.32284] },
    },
    {
      label: "Corner House, Kuvempu Nagar, Mysuru",
      googlePlaceId: "ChIJvUlbylJlrzsR13cTXA5MD_w",
      location: { type: "Point", coordinates: [76.6312, 12.28844] },
    },
  ],
  triggerRadiusM: 600,
  maxDetourM: 3000,
};
