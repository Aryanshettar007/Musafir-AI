import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Transcodes any input audio buffer (M4A, AAC, WAV, OGG, etc.) into standard 44.1 kHz mono MP3.
 * If the input buffer is already MP3, it still ensures clean header and CBR encoding for Gnani VC engine.
 */
export async function convertToMp3(inputBuffer: Buffer): Promise<Buffer> {
  const binary = typeof ffmpegPath === "string" ? ffmpegPath : null;
  if (!binary) {
    console.warn("[audioConverter] ffmpeg-static binary not available, using raw buffer");
    return inputBuffer;
  }

  return new Promise((resolve) => {
    const proc = spawn(binary, [
      "-i",
      "pipe:0",
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      "pipe:1",
    ]) as ChildProcessWithoutNullStreams;

    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (err: Buffer) => {
      stderr += err.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.warn(`[audioConverter] ffmpeg transcoding failed (code ${code}):`, stderr.slice(-300));
        resolve(inputBuffer);
      }
    });

    proc.on("error", (err: Error) => {
      console.warn("[audioConverter] ffmpeg spawn error:", err);
      resolve(inputBuffer);
    });

    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}
