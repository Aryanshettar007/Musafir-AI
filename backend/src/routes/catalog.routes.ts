import { Router } from "express";
import multer from "multer";
import type { GnaniService } from "../clients/gnaniQueue";
import type { Storage } from "../clients/storage";
import { getCatalogHandler, getVoicesHandler } from "../controllers/catalog.controller";
import {
  createCustomVoiceHandler,
  listCustomVoicesHandler,
  deleteCustomVoiceHandler,
} from "../controllers/customVoice.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

// Static option lists for onboarding and settings, plus custom voice management. Mounted behind requireAuth like every API route.
export function catalogRoutes(storage: Storage, gnani?: GnaniService) {
  const router = Router()
    .get("/catalog", getCatalogHandler)
    .get("/voices", getVoicesHandler(storage));

  if (gnani) {
    router.post(
      "/voices/custom",
      upload.fields([
        { name: "audio", maxCount: 1 },
        { name: "avatar", maxCount: 1 },
      ]),
      createCustomVoiceHandler({ gnani, storage })
    );
    router.get("/voices/custom", listCustomVoicesHandler(storage));
    router.delete("/voices/custom/:id", deleteCustomVoiceHandler());
  }

  return router;
}
