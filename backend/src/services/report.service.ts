import { Types } from "mongoose";
import { z } from "zod";
import {
  Report,
  REPORT_CONTENT_TYPES,
  REPORT_REASONS,
  type ReportContentType,
  type ReportReason,
} from "../models/report.model";
import type { Identity } from "./user.service";

const objectIdRegex = /^[a-f0-9]{24}$/i;

export const CreateReportSchema = z.object({
  tripId: z.string().regex(objectIdRegex, "Invalid trip ID").optional(),
  itemId: z.string().regex(objectIdRegex, "Invalid item ID").optional(),
  itemTitle: z.string().trim().max(200).optional(),
  contentType: z.enum(REPORT_CONTENT_TYPES).default("story"),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
  transcriptSnippet: z.string().trim().max(5000).optional(),
  audioUrl: z.string().trim().max(1000).optional(),
});

export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export interface ReportResult {
  id: string;
  status: string;
  contentType: ReportContentType;
  reason: ReportReason;
  createdAt: string;
  message: string;
}

export async function createReport(
  identity: Identity,
  input: CreateReportInput
): Promise<ReportResult> {
  const report = await Report.create({
    userId: identity.uid,
    userEmail: identity.email,
    tripId: input.tripId ? new Types.ObjectId(input.tripId) : undefined,
    itemId: input.itemId ? new Types.ObjectId(input.itemId) : undefined,
    itemTitle: input.itemTitle,
    contentType: input.contentType,
    reason: input.reason,
    details: input.details,
    transcriptSnippet: input.transcriptSnippet,
    audioUrl: input.audioUrl,
    status: "pending",
  });

  return {
    id: String(report._id),
    status: report.status,
    contentType: report.contentType,
    reason: report.reason,
    createdAt: report.createdAt.toISOString(),
    message: "Thank you for reporting. Musafir AI enforces zero tolerance for objectionable content and our moderation team will review this report promptly.",
  };
}

export async function getUserReports(identity: Identity) {
  const reports = await Report.find({ userId: identity.uid })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return reports.map((r) => ({
    id: String(r._id),
    tripId: r.tripId ? String(r.tripId) : undefined,
    itemId: r.itemId ? String(r.itemId) : undefined,
    itemTitle: r.itemTitle,
    contentType: r.contentType,
    reason: r.reason,
    details: r.details,
    audioUrl: r.audioUrl,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}
