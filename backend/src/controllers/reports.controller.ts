import type { Request, Response } from "express";
import { identityOf } from "../middleware/auth";
import { CreateReportSchema, createReport, getUserReports } from "../services/report.service";

export async function postReport(req: Request, res: Response) {
  const input = CreateReportSchema.parse(req.body ?? {});
  const report = await createReport(identityOf(req), input);
  res.status(201).json({ success: true, data: report });
}

export async function getMyReports(req: Request, res: Response) {
  const reports = await getUserReports(identityOf(req));
  res.json({ success: true, data: reports });
}
