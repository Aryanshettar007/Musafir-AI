import type { SponsorSeed } from "../models/sponsor.model";

export const ROYAL_ENFIELD: SponsorSeed = {
  slug: "royal-enfield",
  name: "Royal Enfield Motoverse",
  active: true,
  brief: {
    tagline: "Pure motorcycling through scenic Karnataka passes",
    highlights: [
      "Official partner for highway journeys and coastal passes",
      "Dedicated pitstop lounges, espresso bar, and quick diagnostics",
      "Curated winding route recommendations along the Western Ghats",
    ],
    callToAction: "Experience the highway lounge on Mysore Road",
  },
  outlets: [
    {
      label: "Royal Enfield Pitstop Lounge, Ramanagara",
      googlePlaceId: "ChIJ_zUReQJtrzsR7Hl9JmK1",
      location: { type: "Point", coordinates: [77.2789, 12.7214] },
      address: "Bangalore-Mysore Expressway, Ramanagara",
    },
    {
      label: "Royal Enfield Garage Cafe, Indiranagar",
      googlePlaceId: "ChIJb8u9784TrzsR_d6Vv1bF",
      location: { type: "Point", coordinates: [77.6412, 12.9716] },
      address: "100ft Road, Indiranagar, Bengaluru",
    },
  ],
  triggerRadiusM: 800,
  maxDetourM: 2500,
};
