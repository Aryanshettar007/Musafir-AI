import { Schema, model, type InferSchemaType } from "mongoose";
import { LANGUAGE_IDS } from "../catalog/languages";

// One "Try" clip per voice per language, uploaded by scripts/upload-voice-demos.ts.
// Stores the storage key, not a URL: the bucket is private and URLs are signed per request (they expire).
const voiceDemoSchema = new Schema(
  {
    voice: { type: String, required: true },
    language: { type: String, enum: LANGUAGE_IDS, required: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    storageKey: { type: String, required: true },
    bytes: { type: Number, required: true },
    durationS: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { timestamps: true },
);

voiceDemoSchema.index({ voice: 1, language: 1 }, { unique: true });

export type VoiceDemoDoc = InferSchemaType<typeof voiceDemoSchema>;

export const VoiceDemo = model("VoiceDemo", voiceDemoSchema, "voice_demos");
