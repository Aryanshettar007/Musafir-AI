import { z } from "zod";
import type { Request, Response } from "express";
import { identityOf } from "../middleware/auth";
import { ProfileInputSchema } from "../services/profile";
import * as users from "../services/user.service";

export async function getMe(req: Request, res: Response) {
  const profile = await users.getProfile(identityOf(req));
  res.json({ success: true, data: profile });
}

export async function putMe(req: Request, res: Response) {
  const input = ProfileInputSchema.parse(req.body ?? {});
  const { profile, created } = await users.putProfile(identityOf(req), input);
  res.status(created ? 201 : 200).json({ success: true, data: profile });
}

export async function patchMe(req: Request, res: Response) {
  const input = ProfileInputSchema.parse(req.body ?? {});
  const profile = await users.patchProfile(identityOf(req), input);
  res.json({ success: true, data: profile });
}

export const DeleteAccountSchema = z.object({
  appleAuthorizationCode: z.string().optional(),
  googleToken: z.string().optional(),
});

export async function deleteMe(req: Request, res: Response) {
  const input = DeleteAccountSchema.parse(req.body ?? {});
  await users.deleteAccount(identityOf(req), input);
  res.json({ success: true, message: "Account and associated data deleted successfully." });
}

