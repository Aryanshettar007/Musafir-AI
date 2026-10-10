import type { Request, Response } from "express";
import { z } from "zod";
import { LANGUAGE_IDS } from "../catalog/languages";
import { AppError } from "../errors";
import { identityOf } from "../middleware/auth";
import type { AskService } from "../services/ask/ask.service";

const invalid = (path: string, message: string) =>
  new AppError(400, "VALIDATION_FAILED", "Request is invalid.", { issues: [{ path, message }] });

// Multipart fields arrive as strings; an empty string means "not sent".
const blankIsUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankIsUndefined, schema.optional());

const TURN_CHARS_SLACK = 100_000; // history is cut to MAX_TURN_CHARS later; this only bounds absurd payloads

// Each turn is cut to 500 characters and only the last 6 are used, so a longer history is accepted, not rejected.
const HistorySchema = z.array(z.object({ q: z.string().max(TURN_CHARS_SLACK), a: z.string().max(TURN_CHARS_SLACK) }));

const AskFieldsSchema = z.object({
  text: optional(z.string().trim().min(1).max(500)),
  // Not plain z.coerce.number(): that turns a blank field into 0, a real position in the Gulf of Guinea.
  lat: z.preprocess(blankIsUndefined, z.coerce.number().min(-90).max(90)),
  lng: z.preprocess(blankIsUndefined, z.coerce.number().min(-180).max(180)),
  heading: optional(z.coerce.number().min(0).max(360)),
  tripId: optional(z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character trip id")),
  history: optional(z.string().max(200_000)),
  language: optional(z.enum(LANGUAGE_IDS)),
});

function parseHistory(raw: string | undefined) {
  if (raw === undefined) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw invalid("history", "must be a JSON string");
  }
  const parsed = HistorySchema.safeParse(json);
  if (!parsed.success) {
    throw invalid("history", 'must be an array of { "q": string, "a": string }');
  }
  return parsed.data;
}

// POST /ask (multipart/form-data). Nothing is stored; the reply audio comes back as base64.
export const askController = (service: AskService) => async (req: Request, res: Response) => {
  const fields = AskFieldsSchema.parse(req.body ?? {});
  const audio = req.file?.buffer;
  if (audio && fields.text) {
    throw invalid("text", "send audio or text, not both");
  }
  if (!audio && !fields.text) {
    throw invalid("audio", "send an audio file or text");
  }

  const { model: _model, ...result } = await service.ask({
    identity: identityOf(req),
    question: audio ? { kind: "audio", audio } : { kind: "text", text: fields.text as string },
    position: { lat: fields.lat, lng: fields.lng },
    heading: fields.heading,
    tripId: fields.tripId,
    history: parseHistory(fields.history),
    language: fields.language,
  });
  res.json({ success: true, data: result });
};
