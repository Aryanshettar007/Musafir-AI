import { Schema, model, type InferSchemaType } from "mongoose";
import { INTEREST_IDS } from "../catalog/interests";
import { LANGUAGE_IDS } from "../catalog/languages";
import { GENDER_IDS, MUSIC_MODE_IDS } from "../catalog/profile";

// `language`, `voice` and `interests` are the user's defaults. Each trip takes its own snapshot of them at start.
const userSchema = new Schema(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String },
    name: { type: String, trim: true },
    gender: { type: String, enum: GENDER_IDS, required: true },
    age: { type: Schema.Types.Mixed },
    language: { type: String, enum: LANGUAGE_IDS, required: true },
    voiceGender: { type: String, enum: ["male", "female"], required: true },
    voice: { type: String, required: true },
    interests: { type: [{ type: String, enum: INTEREST_IDS }], required: true },
    musicMode: { type: String, enum: MUSIC_MODE_IDS, required: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = model("User", userSchema);
