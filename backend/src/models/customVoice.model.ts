import { Schema, model, type InferSchemaType } from "mongoose";

const customVoiceSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female"], required: true, default: "male" },
    avatarStorageKey: { type: String },
    demoStorageKey: { type: String },
    demoStorageKeys: { type: Map, of: String },
    embedding: {
      embedding: { type: String, required: true },
      shape: { type: [Number], required: true },
      dtype: { type: String, required: true, default: "torch.bfloat16" },
    },
  },
  { timestamps: true }
);

customVoiceSchema.index({ userId: 1, name: 1 }, { unique: true });

export type CustomVoiceDoc = InferSchemaType<typeof customVoiceSchema>;

export const CustomVoice = model("CustomVoice", customVoiceSchema, "custom_voices");
