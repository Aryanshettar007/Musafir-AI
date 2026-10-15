import { parseBuffer } from "music-metadata";
import type { LanguageId } from "../catalog/languages";
import type { GnaniPriority, GnaniService } from "../clients/gnaniQueue";
import type { SpeakerEmbedding } from "../clients/gnani";
import { CustomVoice } from "../models/customVoice.model";
import { chunkScript } from "./chunk";

// Gnani mp3 is always 128 kbps; used only when the file has no readable duration.
const BYTES_PER_SECOND = 16_000;

export interface NarrateRequest {
  text: string;
  voice: string;
  language: LanguageId;
  priority: GnaniPriority;
  userId?: string;
  speakerEmbedding?: SpeakerEmbedding;
}

export interface Narration {
  audio: Buffer;
  bytes: number;
  durationS: number;
}

import mongoose from "mongoose";
import { findVoice } from "../catalog/voices";

// Script -> one mp3: chunk, TTS each chunk in order through the Gnani queue, concatenate (seam-free, spike 1).
export async function narrate(gnani: GnaniService, req: NarrateRequest): Promise<Narration> {
  let embedding = req.speakerEmbedding;
  if (!embedding && !findVoice(req.voice) && mongoose.connection.readyState === 1) {
    const query = req.userId ? { userId: req.userId, name: req.voice } : { name: req.voice };
    const custom = await CustomVoice.findOne(query).lean();
    if (custom?.embedding) {
      embedding = custom.embedding;
    }
  }

  const parts: Buffer[] = [];
  for (const text of chunkScript(req.text)) {
    parts.push(
      await gnani.tts(
        { text, voice: req.voice, language: req.language, speakerEmbedding: embedding },
        { priority: req.priority }
      )
    );
  }
  if (parts.length === 0) throw new Error("Nothing to narrate: the text is empty");
  const audio = Buffer.concat(parts);
  const meta = await parseBuffer(audio, { mimeType: "audio/mpeg" });
  return { audio, bytes: audio.length, durationS: meta.format.duration ?? audio.length / BYTES_PER_SECOND };
}
