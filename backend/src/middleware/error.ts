import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: `No route ${req.method} ${req.path}` } });
}

// Express 5 forwards errors thrown in async handlers here. Shape: { success: false, error: { code, message, details? } }.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Request is invalid.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  // express.json() rejects malformed JSON bodies with a 400 SyntaxError.
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    res.status(400).json({ success: false, error: { code: "INVALID_JSON", message: "Body is not valid JSON." } });
    return;
  }
  console.error(`[Error] ${req.method} ${req.path}:`, err);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } });
}
