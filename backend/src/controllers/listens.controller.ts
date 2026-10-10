import type { Request, Response } from "express";
import { identityOf } from "../middleware/auth";
import { ListenBatchSchema, recordListens } from "../services/trip/listen.service";

export async function postListens(req: Request, res: Response) {
  const batch = ListenBatchSchema.parse(req.body ?? {});
  res.json({ success: true, data: await recordListens(identityOf(req), batch) });
}
