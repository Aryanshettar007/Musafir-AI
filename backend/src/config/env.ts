import "dotenv/config";
import { z } from "zod";
import { LANGUAGE_IDS, type LanguageId } from "../catalog/languages";

// Every env var the server reads, validated once at startup.
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
  // Third-party API keys. They stay on the server.
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  // GEMINI_API_KEY1, GEMINI_API_KEY2, ... and GNANI_API_KEY1, ... are collected by loadEnv (see apiKeysFrom).
  // Gemini free tier: limits are per model, so each model gets its own requests-per-minute limiter.
  GEMINI_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  GEMINI_LITE_RPM: z.coerce.number().int().min(1).default(10),
  GEMINI_FLASH_RPM: z.coerce.number().int().min(1).default(5),
  // Languages that skip flash-lite and go straight to flash (comma-separated language ids).
  GEMINI_FLASH_LANGUAGES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((l) => l.trim()).filter(Boolean))
    .pipe(z.array(z.enum(LANGUAGE_IDS)))
    .transform((l): LanguageId[] => l),
  TRIPS_PER_DAY: z.coerce.number().int().min(1).default(10),
  MAX_ROUTE_KM: z.coerce.number().positive().default(1200),
  // Wikimedia policy: generic user agents get 429'd; identify the app with a contact URL.
  WIKIPEDIA_USER_AGENT: z.string().min(1).default("MusafirAI/0.1 (https://github.com/Aryanshettar007/Musafir-AI)"),
  // Sign in with Apple token revocation (App Store Guideline 5.1.1(v))
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
}).superRefine((e, ctx) => {
  if (e.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required when STORAGE_DRIVER=s3" });
  }
});

export type Env = z.infer<typeof EnvSchema> & {
  // In order; the next key is used when one hits its limit.
  GEMINI_API_KEYS: string[];
  GNANI_API_KEYS: string[];
};

// NAME1, NAME2, ... in numeric order. A plain NAME (the old single-key form) counts as the first key.
export function apiKeysFrom(source: Record<string, string | undefined>, name: string): string[] {
  const numbered = Object.keys(source)
    .map((k) => ({ k, n: new RegExp(`^${name}(\\d+)$`).exec(k)?.[1] }))
    .filter((x): x is { k: string; n: string } => x.n !== undefined)
    .sort((a, b) => Number(a.n) - Number(b.n))
    .map((x) => source[x.k]?.trim() ?? "");
  return [source[name]?.trim() ?? "", ...numbered].filter((v) => v !== "");
}

function loadEnv(): Env {
  // `KEY=` lines copied from .env.example mean "not set", not an empty value.
  const set = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = EnvSchema.safeParse(set);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration (see backend/.env.example):\n${problems}`);
  }
  const GEMINI_API_KEYS = apiKeysFrom(set, "GEMINI_API_KEY");
  const GNANI_API_KEYS = apiKeysFrom(set, "GNANI_API_KEY");
  const missing = [
    ...(GEMINI_API_KEYS.length === 0 ? ["  GEMINI_API_KEY1: at least one Gemini key is required"] : []),
    ...(GNANI_API_KEYS.length === 0 ? ["  GNANI_API_KEY1: at least one Gnani key is required"] : []),
  ];
  if (missing.length > 0) throw new Error(`Invalid environment configuration (see backend/.env.example):\n${missing.join("\n")}`);
  return { ...parsed.data, GEMINI_API_KEYS, GNANI_API_KEYS };
}

export const env = loadEnv();
