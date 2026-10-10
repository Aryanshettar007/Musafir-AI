// SPIKE (throwaway): list (and with --delete, permanently remove) every object version / delete marker under
// spike/b2-probe/ — B2 keeps all versions by default, so a plain DeleteObject only hides the file.
// Run: npx tsx spikes/storage/b2-cleanup.ts [--delete]
import "dotenv/config";
import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";

const PREFIX = "spike/b2-probe/";
const BUCKET = process.env.S3_BUCKET ?? "Musafir-AI";
const { B2_KEY_ID, B2_APPLICATION_KEY } = process.env;
if (!B2_KEY_ID || !B2_APPLICATION_KEY) throw new Error("B2_KEY_ID / B2_APPLICATION_KEY missing from backend/.env");

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com",
  region: process.env.S3_REGION ?? "us-east-005",
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
});

async function list() {
  const r = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: PREFIX }));
  return [
    ...(r.Versions ?? []).map((v) => ({ kind: "version", key: v.Key!, id: v.VersionId!, size: v.Size, latest: v.IsLatest })),
    ...(r.DeleteMarkers ?? []).map((m) => ({ kind: "delete-marker", key: m.Key!, id: m.VersionId!, size: 0, latest: m.IsLatest })),
  ];
}

async function main() {
  const items = await list();
  console.log(`${items.length} entries under ${PREFIX}:`);
  for (const i of items) console.log(`  ${i.kind} ${i.key} size=${i.size} latest=${i.latest}`);
  if (!process.argv.includes("--delete")) return;
  for (const i of items) {
    if (!i.key.startsWith(PREFIX)) throw new Error(`refusing to delete ${i.key}`);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: i.key, VersionId: i.id }));
  }
  console.log(`after delete: ${(await list()).length} entries under ${PREFIX}`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
