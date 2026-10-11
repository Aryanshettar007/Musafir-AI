import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { UpstreamError } from "../clients/upstream";
import { AppError } from "../errors";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: `No route ${req.method} ${req.path}` } });
}

// Express 5 forwards errors thrown in async handlers here. Shape: { success: false, error: { code, message, details? } }.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
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
  // Google, Gemini, Gnani or storage still failing after retries: our fault upstream, not the app's request.
  if (err instanceof UpstreamError) {
    console.error(`[Upstream] ${req.method} ${req.path}: ${err.service} ${err.status ?? "-"} ${err.message}`);
    res.status(502).json({
      success: false,
      error: { code: "UPSTREAM_UNAVAILABLE", message: `The ${err.service} service is unavailable. Try again shortly.` },
    });
    return;
  }
  console.error(`[Error] ${req.method} ${req.path}:`, err);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } });
}
