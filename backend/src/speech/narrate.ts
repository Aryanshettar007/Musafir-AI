import { parseBuffer } from "music-metadata";
import type { LanguageId } from "../catalog/languages";
import type { GnaniPriority, GnaniService } from "../clients/gnaniQueue";
import { chunkScript } from "./chunk";

// Gnani mp3 is always 128 kbps; used only when the file has no readable duration.
const BYTES_PER_SECOND = 16_000;

export interface NarrateRequest {
  text: string;
  voice: string;
  language: LanguageId;
  priority: GnaniPriority;
}

export interface Narration {
  audio: Buffer;
  bytes: number;
  durationS: number;
}

// Script -> one mp3: chunk, TTS each chunk in order through the Gnani queue, concatenate (seam-free, spike 1).
export async function narrate(gnani: GnaniService, req: NarrateRequest): Promise<Narration> {
  const parts: Buffer[] = [];
  for (const text of chunkScript(req.text)) {
    parts.push(await gnani.tts({ text, voice: req.voice, language: req.language }, { priority: req.priority }));
  }
  if (parts.length === 0) throw new Error("Nothing to narrate: the text is empty");
  const audio = Buffer.concat(parts);
  const meta = await parseBuffer(audio, { mimeType: "audio/mpeg" });
  return { audio, bytes: audio.length, durationS: meta.format.duration ?? audio.length / BYTES_PER_SECOND };
}
