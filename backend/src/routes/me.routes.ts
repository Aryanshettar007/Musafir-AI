import { Router } from "express";
import { deleteMe, getMe, patchMe, putMe } from "../controllers/me.controller";

export const meRoutes = Router()
  .get("/", getMe)
  .put("/", putMe)
  .patch("/", patchMe)
  .delete("/", deleteMe)
  .delete("/account", deleteMe);

