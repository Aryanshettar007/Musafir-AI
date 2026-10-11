import { Schema, model, type InferSchemaType } from "mongoose";
import { INTEREST_IDS } from "../catalog/interests";
import { LANGUAGE_IDS } from "../catalog/languages";
import { MUSIC_MODE_IDS } from "../catalog/profile";
import { pointSchema } from "./point";

export const ITEM_TYPES = ["trip-intro", "story", "food", "town-welcome", "episode", "long-form", "sponsored"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TRIP_STATUSES = ["building", "ready", "failed"] as const;
export const TRIP_STAGES = ["discovering", "curating", "producing", "done"] as const;
export const ITEM_STATUSES = ["pending", "ready", "failed"] as const;

const waypointSchema = new Schema(
  { label: { type: String, required: true }, location: { type: pointSchema, required: true }, placeId: String },
  { _id: false },
);

const audioSchema = new Schema(
  { storageKey: { type: String, required: true }, bytes: { type: Number, required: true }, durationS: { type: Number, required: true } },
  { _id: false },
);

const itemSchema = new Schema({
  type: { type: String, enum: ITEM_TYPES, required: true },
  status: { type: String, enum: ITEM_STATUSES, required: true, default: "pending" },
  placeIds: { type: [Schema.Types.ObjectId], default: [] },
  focus: { type: String, enum: [...INTEREST_IDS, "general"], required: true, default: "general" },
  side: { type: String, enum: ["left", "right", "none"], required: true, default: "none" },
  targetSeconds: { type: Number, required: true },
  // Where the item is "about": closest approach, town entry, gap start.
  anchorRouteDistanceM: { type: Number, required: true },
  // Set when ready (it needs the real audio duration).
  trigger: {
    type: new Schema(
      { location: { type: pointSchema, required: true }, radiusM: { type: Number, required: true }, routeDistanceM: { type: Number, required: true } },
      { _id: false },
    ),
  },
  storyId: { type: Schema.Types.ObjectId },
  // A sponsored item has no story: its audio and transcript live on the item itself.
  title: String,
  audio: { type: audioSchema },
  transcript: String,
  sponsor: { type: new Schema({ slug: { type: String, required: true }, name: { type: String, required: true } }, { _id: false }) },
  // Short reason when failed, for logs and debugging.
  error: String,
});

const tripSchema = new Schema(
  {
    userId: { type: String, required: true }, // Firebase uid
    status: { type: String, enum: TRIP_STATUSES, required: true, default: "building" },
    // Resume point after a restart.
    stage: { type: String, enum: TRIP_STAGES, required: true, default: "discovering" },
    failure: { type: new Schema({ code: String, message: String }, { _id: false }) },
    origin: { type: waypointSchema, required: true },
    destination: { type: waypointSchema, required: true },
    // Copied from the user's profile (plus request overrides) at creation.
    prefs: {
      type: new Schema(
        {
          language: { type: String, enum: LANGUAGE_IDS, required: true },
          voice: { type: String, required: true },
          voiceGender: { type: String, enum: ["male", "female"], required: true },
          interests: { type: [{ type: String, enum: INTEREST_IDS }], default: [] },
          musicMode: { type: String, enum: MUSIC_MODE_IDS, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    route: {
      type: new Schema(
        { polyline: { type: String, required: true }, distanceM: { type: Number, required: true }, durationS: { type: Number, required: true } },
        { _id: false },
      ),
      required: true,
    },
    items: { type: [itemSchema], default: [] },
    builtAt: Date,
    // The process building the trip, renewed while it works, so two processes resuming at startup never build the
    // same trip twice. Removed when the build ends.
    lease: { type: new Schema({ owner: { type: String, required: true }, expiresAt: { type: Date, required: true } }, { _id: false }) },
  },
  { timestamps: true },
);

tripSchema.index({ userId: 1, createdAt: -1 });
tripSchema.index({ status: 1 }); // resume scan on startup
// One trip building at a time per user (S3), enforced by the database so two simultaneous POST /trips can't both pass
// the TRIP_IN_PROGRESS check.
tripSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: "building" }, name: "one_building_trip_per_user" });

export type TripDoc = InferSchemaType<typeof tripSchema>;

export const Trip = model("Trip", tripSchema);
