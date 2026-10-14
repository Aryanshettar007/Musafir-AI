import { Router } from "express";
import { getMyReports, postReport } from "../controllers/reports.controller";

export const reportsRouter = () =>
  Router()
    .post("/", postReport)
    .get("/my", getMyReports);
