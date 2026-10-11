import { Schema, model, type InferSchemaType } from "mongoose";
import { INTEREST_IDS } from "../catalog/interests";
import { LANGUAGE_IDS } from "../catalog/languages";
import { ITEM_TYPES } from "./trip.model";

// The shared cache of written and narrated audio (decision D2). A story exists only once it is narrated and
// uploaded; a half-built story never appears in this collection.
const storySchema = new Schema(
  {
    // v{promptVersion}|{type}|{sorted placeIds}|{language}|{voice}|{focus}|{side}
    cacheKey: { type: String, required: true, unique: true },
    type: { type: String, enum: ITEM_TYPES.filter((t) => t !== "sponsored"), required: true },
    placeIds: { type: [Schema.Types.ObjectId], default: [] },
    language: { type: String, enum: LANGUAGE_IDS, required: true },
    voice: { type: String, required: true },
    focus: { type: String, enum: [...INTEREST_IDS, "general"], required: true },
    side: { type: String, enum: ["left", "right", "none"], required: true },
    title: { type: String, required: true },
    script: { type: String, required: true },
    factsUsed: { type: [String], default: [] },
    audio: {
      type: new Schema(
        { storageKey: { type: String, required: true }, bytes: { type: Number, required: true }, durationS: { type: Number, required: true } },
        { _id: false },
      ),
      required: true,
    },
    models: {
      type: new Schema({ llm: { type: String, required: true }, tts: { type: String, required: true } }, { _id: false }),
      required: true,
    },
    promptVersion: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type StoryDoc = InferSchemaType<typeof storySchema>;

export const Story = model("Story", storySchema);
