import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import type { VerifyIdToken } from "./clients/firebase";
import type { Storage } from "./clients/storage";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { catalogRoutes } from "./routes/catalog.routes";
import { meRoutes } from "./routes/me.routes";

export interface AppOptions {
  verifyIdToken: VerifyIdToken;
  storage: Storage;
  corsOrigins?: string[];
}

// Builds the Express app without connecting to anything, so tests can pass a fake token verifier.
export function createApp({ verifyIdToken, storage, corsOrigins }: AppOptions): Application {
  const app = express();

  app.use(cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Musafir AI Backend API is running",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  if (storage.localRoot) {
    // Development storage driver only. Production files come from the bucket through signed URLs.
    // Public because audio players can't always attach an Authorization header.
    app.use("/files", express.static(storage.localRoot));
  }

  // Everything below needs a Firebase ID token. Sign-up and login happen in the app against Firebase directly.
  app.use(requireAuth(verifyIdToken));
  app.use(catalogRoutes(storage));
  app.use("/me", meRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
