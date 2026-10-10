import "dotenv/config";
import { z } from "zod";

// Every env var the server reads, validated once at startup. Spike-only keys (Gnani, Gemini, Maps) join here
// when the pipeline code that needs them lands.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  // Explicit, because an Atlas URI without a path silently uses the database "test".
  MONGODB_DB_NAME: z.string().min(1).default("musafir_ai"),
  FIREBASE_PROJECT_ID: z.string().min(1),
  // Comma-separated list of allowed browser origins. The mobile app doesn't send Origin, so this only matters for web.
  CORS_ORIGINS: z.string().optional(),
  // Audio storage. "local" = files on disk served by this server (development), "s3" = private bucket (Backblaze B2).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("generated/storage"),
  // How the phone reaches this server, for local file URLs (use the PC's LAN IP when testing on a phone).
  PUBLIC_BASE_URL: z.url().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  // B2 bucket names with capitals aren't valid hostnames, so address buckets by path (R2 accepts this too).
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Lifetime of signed download URLs. S3 caps presigned URLs at 7 days.
  AUDIO_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(604_800),
}).superRefine((e, ctx) => {
  if (e.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required when STORAGE_DRIVER=s3" });
  }
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  // `KEY=` lines copied from .env.example mean "not set", not an empty value.
  const set = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = EnvSchema.safeParse(set);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration (see backend/.env.example):\n${problems}`);
  }
  return parsed.data;
}

export const env = loadEnv();
