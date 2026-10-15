import type { SponsorSeed } from "../models/sponsor.model";

export const KARNATAKA_TOURISM: SponsorSeed = {
  slug: "karnataka-tourism",
  name: "Karnataka Tourism (KSTDC)",
  active: true,
  brief: {
    tagline: "One State. Many Worlds. Official Heritage Trails",
    highlights: [
      "Official tourism board partner for cultural & architectural expeditions",
      "Curated historical audio stories across Srirangapatna and Mysuru",
      "Verified heritage info verified by Department of Archaeology",
    ],
    callToAction: "Discover heritage waypoints along your drive",
  },
  outlets: [
    {
      label: "KSTDC Heritage Centre, Srirangapatna",
      googlePlaceId: "ChIJb_k4L_9xrzsRLPqPj9M7",
      location: { type: "Point", coordinates: [76.6934, 12.4238] },
      address: "Bangalore-Mysore Highway, Srirangapatna",
    },
    {
      label: "Mysuru Palace Cultural Welcome Center",
      googlePlaceId: "ChIJO7N3Pfp6rzsR5nZ6g2cW",
      location: { type: "Point", coordinates: [76.6552, 12.3051] },
      address: "Sayyaji Rao Rd, Agrahara, Chamrajpura, Mysuru",
    },
  ],
  triggerRadiusM: 1000,
  maxDetourM: 2000,
};
