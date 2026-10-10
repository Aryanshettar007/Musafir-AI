import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage } from "./storage";

export interface S3StorageConfig {
  endpoint: string; // Backblaze B2: https://s3.<region>.backblazeb2.com
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  urlTtlSeconds: number; // S3 allows at most 7 days (604 800 s)
}

// Production driver: a private S3-compatible bucket (Backblaze B2 now, Cloudflare R2 possible by config only).
// Downloads go straight from the bucket to the phone through presigned GET URLs.
export function s3Storage(config: S3StorageConfig): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 3,
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    url(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: config.urlTtlSeconds,
      });
    },
  };
}
