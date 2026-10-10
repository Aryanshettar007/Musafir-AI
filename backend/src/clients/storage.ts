import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Where audio files live. Callers only ever store and pass around keys like "voice-demos/kn-IN/Girish.mp3";
// the driver decides how a key becomes a downloadable URL.
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  // A URL the app can download without auth headers. May expire, so never persist it.
  url(key: string): Promise<string>;
  // Set only for the local driver: the folder the app must serve at /files.
  readonly localRoot?: string;
}

// Development driver: files on disk under `root`, served by this server at `${publicBaseUrl}/files/<key>`.
export function localStorage(root: string, publicBaseUrl: string): Storage {
  const base = publicBaseUrl.replace(/\/$/, "");
  return {
    localRoot: root,
    async put(key, body) {
      const file = path.join(root, ...safeKey(key).split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async url(key) {
      return `${base}/files/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(key) || key.split("/").includes("..")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return key;
}
