import { parseBuffer } from "music-metadata";
import { AppError } from "../../errors";

// Gnani STT takes at most 30 s; the app records at most ~25 s.
export const MAX_QUESTION_S = 25;

export interface QuestionAudio {
  mimeType: string;
  filename: string;
  durationS?: number;
}

// Containers we accept, by what the file really is (the multipart mime type is often wrong or generic).
const FORMATS: Array<{ container: RegExp; mimeType: string; ext: string }> = [
  { container: /^mpeg$/i, mimeType: "audio/mpeg", ext: "mp3" },
  { container: /^wav/i, mimeType: "audio/wav", ext: "wav" },
  { container: /^(m4a|mp4|isom)/i, mimeType: "audio/mp4", ext: "m4a" },
  { container: /^adts/i, mimeType: "audio/aac", ext: "aac" },
  { container: /^ogg/i, mimeType: "audio/ogg", ext: "ogg" },
  { container: /^(ebml|webm|matroska)/i, mimeType: "audio/webm", ext: "webm" },
];

// Sniffs the bytes: UNSUPPORTED_AUDIO (415) when it isn't m4a/aac, mp3, wav, ogg or webm, AUDIO_TOO_LONG (422) over 25 s.
// Web browsers record in webm (opus), which is accepted here and automatically transcoded to mp3 for Gnani STT.
export async function inspectAudio(audio: Buffer): Promise<QuestionAudio> {
  let container: string | undefined;
  let durationS: number | undefined;
  try {
    // duration: true reads the whole (at most 2 MB) file when the header has no duration, e.g. VBR mp3 without a Xing
    // header or raw ADTS aac, instead of guessing from the first frame.
    const meta = await parseBuffer(audio, undefined, { duration: true, skipCovers: true });
    container = meta.format.container;
    durationS = meta.format.duration;
  } catch {
    throw unsupported();
  }
  const format = FORMATS.find((f) => container !== undefined && f.container.test(container));
  if (!format) throw unsupported();
  if (durationS !== undefined && durationS > MAX_QUESTION_S) {
    throw new AppError(422, "AUDIO_TOO_LONG", `The question is ${Math.ceil(durationS)} seconds long; the maximum is ${MAX_QUESTION_S}.`);
  }
  return { mimeType: format.mimeType, filename: `question.${format.ext}`, durationS };
}

const unsupported = () => new AppError(415, "UNSUPPORTED_AUDIO", "Send the question as m4a/aac, mp3, wav, ogg or webm audio.");
