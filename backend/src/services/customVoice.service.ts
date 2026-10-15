import { Types } from "mongoose";
import type { GnaniService } from "../clients/gnaniQueue";
import type { Storage } from "../clients/storage";
import { badRequest, conflict, notFound } from "../errors";
import { CustomVoice, type CustomVoiceDoc } from "../models/customVoice.model";
import type { VoiceDto } from "./catalog.service";

import { convertToMp3 } from "../utils/audioConverter";
import { getDemoLine } from "../catalog/demoLines";
import type { LanguageId } from "../catalog/languages";

export interface CreateCustomVoiceInput {
  userId: string;
  name: string;
  gender?: "male" | "female";
  audioBuffer: Buffer;
  audioFilename: string;
  audioMimeType: string;
  avatarBuffer?: Buffer;
  avatarMimeType?: string;
}

export async function createCustomVoice(
  deps: { gnani: GnaniService; storage: Storage },
  input: CreateCustomVoiceInput
): Promise<VoiceDto> {
  const name = input.name.trim();
  if (!name || name.length < 2 || name.length > 50) {
    throw badRequest("INVALID_NAME", "Voice name must be between 2 and 50 characters.");
  }

  // Check if voice with this name already exists for this user
  const existing = await CustomVoice.findOne({ userId: input.userId, name }).lean();
  if (existing) {
    throw conflict("VOICE_EXISTS", `A custom voice named "${name}" already exists.`);
  }

  // Ensure reference audio is in clean MP3 format required by Gnani Voice Cloning engine
  const mp3Audio = await convertToMp3(input.audioBuffer);

  // Extract speaker embedding from Gnani Voice Cloning API
  const embedding = await deps.gnani.voiceCloneEmbeddings(
    {
      audio: mp3Audio,
      filename: "voice_reference.mp3",
      mimeType: "audio/mpeg",
    },
    { priority: "interactive" }
  );

  const voiceId = new Types.ObjectId();
  let avatarStorageKey: string | undefined;
  let demoStorageKey: string | undefined;

  // Store avatar if provided
  if (input.avatarBuffer && input.avatarBuffer.length > 0) {
    avatarStorageKey = `custom-voices/avatars/${input.userId}/${voiceId.toString()}.jpg`;
    await deps.storage.put(avatarStorageKey, input.avatarBuffer, input.avatarMimeType || "image/jpeg");
  }

  // Generate a short preview demo narration with the cloned voice
  try {
    const demoAudio = await deps.gnani.tts(
      {
        text: `Hello! This is ${name}, your custom AI voice companion.`,
        speakerEmbedding: embedding,
      },
      { priority: "interactive" }
    );
    if (demoAudio && demoAudio.length > 0) {
      demoStorageKey = `custom-voices/demos/${input.userId}/${voiceId.toString()}.mp3`;
      await deps.storage.put(demoStorageKey, demoAudio, "audio/mpeg");
    }
  } catch (err) {
    console.warn(`[CustomVoice] Could not generate preview demo for voice "${name}":`, err);
  }

  const doc = await CustomVoice.create({
    _id: voiceId,
    userId: input.userId,
    name,
    gender: input.gender || "male",
    avatarStorageKey,
    demoStorageKey,
    embedding,
  });

  return {
    id: doc._id.toString(),
    name: doc.name,
    gender: doc.gender as "male" | "female",
    recommended: false,
    demoUrl: demoStorageKey ? await deps.storage.url(demoStorageKey) : null,
    avatarUrl: avatarStorageKey ? await deps.storage.url(avatarStorageKey) : null,
    isCustom: true,
  };
}

export async function listUserCustomVoices(
  userId: string,
  storage: Storage
): Promise<VoiceDto[]> {
  const voices = await CustomVoice.find({ userId }).sort({ createdAt: -1 }).lean();
  return Promise.all(
    voices.map(async (v) => ({
      id: v._id.toString(),
      name: v.name,
      gender: v.gender as "male" | "female",
      recommended: false,
      demoUrl: v.demoStorageKey ? await storage.url(v.demoStorageKey) : null,
      avatarUrl: v.avatarStorageKey ? await storage.url(v.avatarStorageKey) : null,
      isCustom: true,
    }))
  );
}

export async function deleteCustomVoice(
  userId: string,
  voiceId: string
): Promise<{ deleted: boolean }> {
  const result = await CustomVoice.deleteOne({ _id: voiceId, userId });
  if (result.deletedCount === 0) {
    throw notFound("VOICE_NOT_FOUND", "Custom voice not found.");
  }
  return { deleted: true };
}

const inFlightDemos = new Map<string, Promise<Buffer>>();

export async function getOrCreateCustomVoiceDemo(
  deps: { storage: Storage; gnani: GnaniService },
  voiceId: string,
  language: LanguageId
): Promise<{ redirectUrl?: string; audioBuffer?: Buffer }> {
  const cv = await CustomVoice.findById(voiceId);
  if (!cv) {
    throw notFound("VOICE_NOT_FOUND", "Custom voice not found.");
  }

  // Check if we already have a storage key for this language
  const storageKey =
    cv.demoStorageKeys instanceof Map
      ? cv.demoStorageKeys.get(language)
      : (cv.demoStorageKeys as any)?.[language];

  if (storageKey) {
    const url = await deps.storage.url(storageKey);
    return { redirectUrl: url };
  }

  // If not yet generated, generate with Gnani TTS using language-specific line
  const cacheKey = `${cv._id.toString()}_${language}`;
  let generatePromise = inFlightDemos.get(cacheKey);

  if (!generatePromise) {
    generatePromise = (async () => {
      if (!cv.embedding) {
        throw badRequest("MISSING_EMBEDDING", "Custom voice has no speaker embedding.");
      }

      const text = getDemoLine(language, cv.name, cv.gender as "male" | "female");
      const audio = await deps.gnani.tts(
        {
          text,
          language,
          speakerEmbedding: cv.embedding,
        },
        { priority: "interactive" }
      );

      const newKey = `custom-voices/demos/${cv.userId}/${cv._id.toString()}_${language}_v2.mp3`;
      await deps.storage.put(newKey, audio, "audio/mpeg");
      await CustomVoice.updateOne(
        { _id: cv._id },
        { $set: { [`demoStorageKeys.${language}`]: newKey } }
      );

      return audio;
    })().finally(() => {
      inFlightDemos.delete(cacheKey);
    });

    inFlightDemos.set(cacheKey, generatePromise);
  }

  const audio = await generatePromise;
  return { audioBuffer: audio };
}

