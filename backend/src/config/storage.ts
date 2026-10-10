import path from "node:path";
import { s3Storage } from "../clients/s3Storage";
import { localStorage, type Storage } from "../clients/storage";
import type { Env } from "./env";

export function createStorage(env: Env): Storage {
  if (env.STORAGE_DRIVER === "s3") {
    return s3Storage({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION!,
      bucket: env.S3_BUCKET!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      urlTtlSeconds: env.AUDIO_URL_TTL_SECONDS,
    });
  }
  const root = path.resolve(__dirname, "../..", env.LOCAL_STORAGE_DIR);
  return localStorage(root, env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`);
}
