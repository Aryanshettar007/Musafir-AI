import { Schema, model, type InferSchemaType } from "mongoose";
import { LANGUAGE_IDS, type LanguageId } from "../catalog/languages";
import { VOICES } from "../catalog/voices";
import { pointSchema } from "./point";

// A (sample) sponsoring business. `brief` holds the only facts a generated ad may use. `ads` caches one generated
// message per (language, voice); audio lives in storage under `storageKey`, never as a URL.
const sponsorSchema = new Schema(
  {
    slug: { type: String, required: true },
    name: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    brief: {
      type: new Schema(
        {
          tagline: { type: String, required: true },
          highlights: { type: [String], default: [] },
          callToAction: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    outlets: {
      type: [
        new Schema(
          {
            label: { type: String, required: true },
            googlePlaceId: { type: String },
            location: { type: pointSchema, required: true },
            address: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    triggerRadiusM: { type: Number, required: true, default: 600 },
    maxDetourM: { type: Number, required: true, default: 3000 },
    ads: {
      type: [
        new Schema(
          {
            language: { type: String, enum: LANGUAGE_IDS, required: true },
            voice: { type: String, enum: VOICES.map((v) => v.name), required: true },
            title: { type: String, required: true },
            script: { type: String, required: true },
            storageKey: { type: String, required: true },
            bytes: { type: Number, required: true },
            durationS: { type: Number, required: true },
            createdAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

sponsorSchema.index({ slug: 1 }, { unique: true });
sponsorSchema.index({ "outlets.location": "2dsphere" });

export type SponsorDoc = InferSchemaType<typeof sponsorSchema>;

// Plain shapes (Mongoose's inferred sub-document types are awkward to construct by hand).
export interface SponsorAd {
  language: LanguageId;
  voice: string;
  title: string;
  script: string;
  storageKey: string;
  bytes: number;
  durationS: number;
  createdAt: Date;
}
export interface SponsorSeed {
  slug: string;
  name: string;
  active: boolean;
  brief: { tagline: string; highlights: string[]; callToAction: string };
  outlets: Array<{
    label: string;
    googlePlaceId?: string;
    location: { type: "Point"; coordinates: number[] };
    address?: string;
  }>;
  triggerRadiusM: number;
  maxDetourM: number;
}

export const Sponsor = model("Sponsor", sponsorSchema, "sponsors");
