import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { AppError } from "../errors";
import { askController } from "../controllers/ask.controller";
import { rateLimit } from "../middleware/rateLimit";
import type { AskService } from "../services/ask/ask.service";

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

export interface AskRouterDeps {
  ask: AskService;
  // 20 questions per user per 10 minutes by default.
  rateLimit?: { max: number; windowMs: number; now?: () => number };
}

// Text fields: history is the big one (6 turns of 2 x 500 characters is ~18 KB even in 3-byte scripts).
const MAX_FIELD_BYTES = 256 * 1024;

// Multipart is parsed here only (memory storage, 2 MB): the audio is never written to disk, and multer stops reading
// at the limit instead of buffering the whole upload. Text fields are capped too (multer's default is 1 MB each).
function parseAudio(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 20, fieldSize: MAX_FIELD_BYTES },
  }).single("audio");
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.is("application/json")) {
      return next();
    }
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(413, "AUDIO_TOO_LARGE", `The audio is larger than ${MAX_AUDIO_BYTES / 1024 / 1024} MB.`));
        }
        return next(new AppError(400, "VALIDATION_FAILED", "Request is invalid.", { issues: [{ path: err.field ?? "", message: err.message }] }));
      }
      next(err);
    });
  };
}

export function askRouter({ ask, rateLimit: limit }: AskRouterDeps): Router {
  const limiter = rateLimit({
    max: limit?.max ?? 20,
    windowMs: limit?.windowMs ?? 10 * 60_000,
    now: limit?.now,
    message: "Too many questions. Try again in a few minutes.",
  });
  // The limiter runs before the upload is parsed, so a flood costs almost nothing.
  return Router().post("/", limiter, parseAudio(), askController(ask));
}
