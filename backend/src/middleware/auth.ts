import type { NextFunction, Request, Response } from "express";
import type { VerifyIdToken } from "../clients/firebase";
import { unauthorized } from "../errors";
import type { Identity } from "../services/user.service";

declare module "express-serve-static-core" {
  interface Request {
    identity?: Identity;
  }
}

// Requires `Authorization: Bearer <Firebase ID token>` (from `user.getIdToken()` in the app).
export function requireAuth(verify: VerifyIdToken) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const [scheme, token] = req.header("authorization")?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw unauthorized("Missing Authorization: Bearer <Firebase ID token>.");
    try {
      req.identity = await verify(token);
    } catch {
      throw unauthorized("Invalid or expired ID token. Get a fresh one with user.getIdToken().");
    }
    next();
  };
}

// For handlers mounted behind requireAuth.
export function identityOf(req: Request): Identity {
  if (!req.identity) throw unauthorized("Not authenticated.");
  return req.identity;
}
