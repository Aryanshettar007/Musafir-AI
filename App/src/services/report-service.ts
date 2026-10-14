import { api } from './api';

export type ReportContentType = 'story' | 'live_qa' | 'audio' | 'transcript' | 'other';

export type ReportReason =
  | 'inappropriate'
  | 'inaccurate'
  | 'offensive'
  | 'harmful'
  | 'hate_speech'
  | 'copyright'
  | 'other';

export interface CreateReportPayload {
  tripId?: string;
  itemId?: string;
  itemTitle?: string;
  contentType: ReportContentType;
  reason: ReportReason;
  details?: string;
  transcriptSnippet?: string;
  audioUrl?: string;
}

export interface ReportResponse {
  id: string;
  status: string;
  contentType: ReportContentType;
  reason: ReportReason;
  createdAt: string;
  message: string;
}

/**
 * Submits an AI content moderation report to the Musafir AI backend.
 * Required by Apple Guideline 1.2 and Google Play GenAI Policy.
 */
export async function submitContentReport(
  payload: CreateReportPayload
): Promise<ReportResponse> {
  const res = await api.post<{ success: boolean; data: ReportResponse }>(
    '/reports',
    payload
  );
  return res.data;
}
