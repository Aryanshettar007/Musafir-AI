import type { Request, Response } from "express";
import { z } from "zod";
import { LANGUAGE_IDS } from "../catalog/languages";
import type { Storage } from "../clients/storage";
import { env } from "../config/env";
import { getCatalog, listVoices } from "../services/catalog.service";

const VoicesQuerySchema = z.object({
  language: z.enum(LANGUAGE_IDS),
  gender: z.enum(["male", "female"]).optional(),
});

export function getCatalogHandler(_req: Request, res: Response) {
  res.json({ success: true, data: getCatalog() });
}

export function getVoicesHandler(storage: Storage) {
  return async (req: Request, res: Response) => {
    const { language, gender } = VoicesQuerySchema.parse(req.query);
    const userId = req.identity?.uid;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host");
    const baseUrl = env.PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : undefined);
    res.json({ success: true, data: await listVoices(language, gender, storage, userId, baseUrl) });
  };
}
