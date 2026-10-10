import { Router } from "express";
import type { Storage } from "../clients/storage";
import { getCatalogHandler, getVoicesHandler } from "../controllers/catalog.controller";

// Static option lists for onboarding and settings. Mounted behind requireAuth like every API route.
export function catalogRoutes(storage: Storage) {
  return Router().get("/catalog", getCatalogHandler).get("/voices", getVoicesHandler(storage));
}
