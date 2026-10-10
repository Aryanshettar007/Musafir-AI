import { Schema, model, type InferSchemaType } from "mongoose";
import { INTEREST_IDS } from "../catalog/interests";
import { pointSchema } from "./point";

export const PLACE_KINDS = ["poi", "town", "region"] as const; // region = district, river, hills (long-form stories)

// Everything we might narrate, shared by all trips. Google terms: `googlePlaceId` is kept long term, the rest of
// `google` is a refreshable snapshot (`fetchedAt`).
const placeSchema = new Schema(
  {
    kind: { type: String, enum: PLACE_KINDS, required: true },
    // Wikipedia title when matched, else the Google display name.
    name: { type: String, required: true },
    location: { type: pointSchema, required: true },
    googlePlaceId: { type: String },
    google: {
      type: new Schema(
        {
          primaryType: String,
          types: [String],
          userRatingCount: Number,
          fetchedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    wikipedia: {
      type: new Schema({ pageId: { type: Number, required: true }, title: String, url: String }, { _id: false }),
    },
    wikidataId: { type: String },
    // RAG input: plain-text Wikipedia extract (at most 6 000 chars).
    facts: {
      type: new Schema(
        {
          text: { type: String, required: true },
          source: { type: String, enum: ["wikipedia"], required: true },
          url: String,
          fetchedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    interests: { type: [{ type: String, enum: INTEREST_IDS }], default: [] },
  },
  { timestamps: true },
);

placeSchema.index({ location: "2dsphere" });
placeSchema.index({ googlePlaceId: 1 }, { unique: true, sparse: true });
placeSchema.index({ "wikipedia.pageId": 1 }, { unique: true, sparse: true });

export type PlaceDoc = InferSchemaType<typeof placeSchema>;

export const Place = model("Place", placeSchema);
