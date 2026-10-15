import type { Request, Response } from "express";
import { z } from "zod";
import type { GnaniService } from "../clients/gnaniQueue";
import type { Storage } from "../clients/storage";
import { badRequest } from "../errors";
import { identityOf } from "../middleware/auth";
import { LANGUAGE_IDS, type LanguageId } from "../catalog/languages";
import {
  createCustomVoice,
  listUserCustomVoices,
  deleteCustomVoice,
  getOrCreateCustomVoiceDemo,
} from "../services/customVoice.service";

const CreateCustomVoiceSchema = z.object({
  name: z.string().min(2).max(50),
  gender: z.enum(["male", "female"]).optional().default("male"),
  audioBase64: z.string().optional(),
  audioFilename: z.string().optional(),
  audioMimeType: z.string().optional(),
  avatarBase64: z.string().optional(),
  avatarMimeType: z.string().optional(),
});

export function createCustomVoiceHandler(deps: { gnani: GnaniService; storage: Storage }) {
  return async (req: Request, res: Response) => {
    const identity = identityOf(req);

    const parsed = CreateCustomVoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const audioFile = files?.["audio"]?.[0] || (req.file?.fieldname === "audio" ? req.file : undefined);
    const avatarFile = files?.["avatar"]?.[0];

    let audioBuffer: Buffer | undefined = audioFile?.buffer;
    const audioFilename = audioFile?.originalname || parsed.data.audioFilename || "voice_reference.m4a";
    const audioMimeType = audioFile?.mimetype || parsed.data.audioMimeType || "audio/m4a";

    if (!audioBuffer && parsed.data.audioBase64) {
      try {
        audioBuffer = Buffer.from(parsed.data.audioBase64, "base64");
      } catch {
        throw badRequest("INVALID_AUDIO", "Failed to decode base64 audio data.");
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw badRequest("MISSING_AUDIO", "Reference audio file is required to clone voice.");
    }

    let avatarBuffer: Buffer | undefined = avatarFile?.buffer;
    const avatarMimeType = avatarFile?.mimetype || parsed.data.avatarMimeType;

    if (!avatarBuffer && parsed.data.avatarBase64) {
      try {
        avatarBuffer = Buffer.from(parsed.data.avatarBase64, "base64");
      } catch {}
    }

    const voice = await createCustomVoice(deps, {
      userId: identity.uid,
      name: parsed.data.name,
      gender: parsed.data.gender,
      audioBuffer,
      audioFilename,
      audioMimeType,
      avatarBuffer,
      avatarMimeType,
    });

    res.status(201).json({ success: true, data: voice });
  };
}

export function listCustomVoicesHandler(storage: Storage) {
  return async (req: Request, res: Response) => {
    const identity = identityOf(req);
    const voices = await listUserCustomVoices(identity.uid, storage);
    res.json({ success: true, data: voices });
  };
}

export function deleteCustomVoiceHandler() {
  return async (req: Request, res: Response) => {
    const identity = identityOf(req);
    const voiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!voiceId || typeof voiceId !== "string") throw badRequest("MISSING_ID", "Voice ID is required.");
    const result = await deleteCustomVoice(identity.uid, voiceId);
    res.json({ success: true, data: result });
  };
}

export function getCustomVoiceDemoHandler(deps: { storage: Storage; gnani: GnaniService }) {
  return async (req: Request, res: Response) => {
    const voiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!voiceId || typeof voiceId !== "string") {
      throw badRequest("MISSING_ID", "Voice ID is required.");
    }
    const rawLang = req.query.language as string | undefined;
    const language = (rawLang && (LANGUAGE_IDS as readonly string[]).includes(rawLang)
      ? rawLang
      : "en-IN") as LanguageId;

    const result = await getOrCreateCustomVoiceDemo(deps, voiceId, language);
    if (result.redirectUrl) {
      return res.redirect(302, result.redirectUrl);
    }
    if (result.audioBuffer) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", result.audioBuffer.length);
      res.setHeader("Cache-Control", "public, max-age=604800");
      return res.send(result.audioBuffer);
    }
    res.status(500).json({ success: false, message: "Could not retrieve voice demo audio" });
  };
}

