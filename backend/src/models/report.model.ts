import { Schema, model, type InferSchemaType } from "mongoose";

export const REPORT_REASONS = [
  "inappropriate",
  "inaccurate",
  "offensive",
  "harmful",
  "hate_speech",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_CONTENT_TYPES = [
  "story",
  "live_qa",
  "audio",
  "transcript",
  "other",
] as const;
export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number];

export const REPORT_STATUSES = ["pending", "reviewed", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const reportSchema = new Schema(
  {
    userId: { type: String, required: true },
    userEmail: { type: String },
    tripId: { type: Schema.Types.ObjectId },
    itemId: { type: Schema.Types.ObjectId },
    itemTitle: { type: String, trim: true },
    contentType: {
      type: String,
      enum: REPORT_CONTENT_TYPES,
      required: true,
      default: "story",
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: true,
    },
    details: { type: String, trim: true, maxlength: 1000 },
    transcriptSnippet: { type: String, trim: true, maxlength: 5000 },
    audioUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      required: true,
      default: "pending",
    },
  },
  { timestamps: true }
);

reportSchema.index({ userId: 1, createdAt: -1 });
reportSchema.index({ status: 1 });
reportSchema.index({ tripId: 1 });

export type ReportDoc = InferSchemaType<typeof reportSchema>;

export const Report = model("Report", reportSchema);
