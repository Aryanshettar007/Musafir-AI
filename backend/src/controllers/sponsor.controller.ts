import type { Request, Response } from "express";
import { Sponsor } from "../models/sponsor.model";

// Partner images for rich card headers (Corner House DBC, Royal Enfield Guerrilla 450, Coorg greenery)
const SPONSOR_IMAGE_MAP: Record<string, string> = {
  "corner-house": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=800&q=80",
  "royal-enfield": "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80",
  "karnataka-tourism": "https://images.unsplash.com/photo-1596401057633-54a8fe8ef647?auto=format&fit=crop&w=800&q=80",
};

const SPONSOR_CATEGORY_MAP: Record<string, string> = {
  "corner-house": "Food & Pitstop",
  "royal-enfield": "Motorcycle & Adventure",
  "karnataka-tourism": "Official Tourism Partner",
};

export async function getSponsorsHandler(_req: Request, res: Response) {
  try {
    const docs = await Sponsor.find({ active: true }, { ads: 0 }).lean();
    const sponsors = docs.map((doc) => ({
      slug: doc.slug,
      name: doc.name,
      active: doc.active,
      category: SPONSOR_CATEGORY_MAP[doc.slug] || "Brand Experience",
      imageUrl: SPONSOR_IMAGE_MAP[doc.slug] || "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80",
      brief: doc.brief,
      outlets: doc.outlets?.map((outlet) => ({
        label: outlet.label,
        googlePlaceId: outlet.googlePlaceId,
        address: outlet.address,
        latitude: outlet.location?.coordinates?.[1] ?? 0,
        longitude: outlet.location?.coordinates?.[0] ?? 0,
      })) || [],
      triggerRadiusM: doc.triggerRadiusM,
      maxDetourM: doc.maxDetourM,
    }));

    res.json({ success: true, data: sponsors });
  } catch (error: any) {
    console.error("[getSponsorsHandler] Error fetching sponsors:", error);
    res.status(500).json({ success: false, error: "Failed to fetch sponsors" });
  }
}
