import { Router } from "express";
import { getMe, patchMe, putMe } from "../controllers/me.controller";

export const meRoutes = Router().get("/", getMe).put("/", putMe).patch("/", patchMe);
