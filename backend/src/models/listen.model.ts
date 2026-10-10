import { Schema, model, type InferSchemaType } from "mongoose";

export const LISTEN_EVENTS = ["started", "completed", "skipped"] as const;

// What the user heard, sent in batches by the app. `clientEventId` makes resending a batch harmless.
const listenSchema = new Schema(
  {
    userId: { type: String, required: true },
    clientEventId: { type: String, required: true },
    tripId: { type: Schema.Types.ObjectId, required: true },
    itemId: { type: Schema.Types.ObjectId, required: true },
    // Absent for items without a story (the sponsored ad).
    storyId: { type: Schema.Types.ObjectId },
    placeIds: { type: [Schema.Types.ObjectId], default: [] },
    event: { type: String, enum: LISTEN_EVENTS, required: true },
    at: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

listenSchema.index({ userId: 1, clientEventId: 1 }, { unique: true });
listenSchema.index({ userId: 1, placeIds: 1 }); // "already heard" lookups

export type ListenDoc = InferSchemaType<typeof listenSchema>;

export const Listen = model("Listen", listenSchema);
