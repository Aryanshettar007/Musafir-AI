// SPIKE (throwaway): Backblaze B2 through the S3-compatible API (AWS SDK v3) — upload, head, presigned GET,
// private-bucket check, range request, download timing, delete. Touches ONLY keys under spike/b2-probe/.
// Never prints secrets: presigned URLs are shown without their signature query.
// Run: npx tsx spikes/storage/b2-probe.ts   (SPIKE_DNS=1 if Node's DNS server refuses lookups,
//      SPIKE_PATH_STYLE=1 to force path-style URLs)
import "dotenv/config";
import dns from "node:dns";
if (process.env.SPIKE_DNS) dns.setServers(["8.8.8.8", "4.2.2.2"]);
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT = process.env.S3_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com";
const REGION = process.env.S3_REGION ?? "us-east-005";
const BUCKET = process.env.S3_BUCKET ?? "Musafir-AI";
const PATH_STYLE = process.env.SPIKE_PATH_STYLE === "1";
const KEY = "spike/b2-probe/Girish.mp3";
const FILE = path.resolve(__dirname, "../../generated/voice-demos/kn-IN/Girish.mp3");
const TTL = 604_800; // 7 days, the S3 SigV4 maximum

const { B2_KEY_ID, B2_APPLICATION_KEY } = process.env;
if (!B2_KEY_ID || !B2_APPLICATION_KEY) throw new Error("B2_KEY_ID / B2_APPLICATION_KEY missing from backend/.env");
if (!KEY.startsWith("spike/b2-probe/")) throw new Error("refusing to touch keys outside spike/b2-probe/");

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: PATH_STYLE,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
});

const redact = (u: string) => {
  const url = new URL(u);
  return `${url.origin}${url.pathname}?[${[...url.searchParams.keys()].join(",")}]`;
};
const ms = (t0: number) => `${(performance.now() - t0).toFixed(0)} ms`;
const results: Array<[string, boolean]> = [];
const record = (step: string, ok: boolean, detail: string) => {
  results.push([step, ok]);
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
};
const errMsg = (e: unknown) =>
  e instanceof S3ServiceException
    ? `${e.name} (${e.$metadata.httpStatusCode}) ${e.message}`
    : e instanceof Error
      ? e.message
      : String(e);

async function headOrNull() {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: KEY }));
  } catch (e) {
    if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) return null;
    throw e;
  }
}

async function main() {
  console.log(`endpoint=${ENDPOINT} region=${REGION} bucket=${BUCKET} forcePathStyle=${PATH_STYLE}`);
  const local = await readFile(FILE);
  console.log(`local file: ${local.length} bytes`);

  // a. PutObject (first upload timed, plus two re-uploads for a spread)
  try {
    const t0 = performance.now();
    const put = await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: local, ContentType: "audio/mpeg" }));
    record("a. PutObject", true, `${ms(t0)} (first call, incl. TLS setup), ETag ${put.ETag}`);
    for (let i = 0; i < 2; i++) {
      const t1 = performance.now();
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: local, ContentType: "audio/mpeg" }));
      console.log(`   re-upload ${i + 1}: ${ms(t1)}`);
    }
  } catch (e) {
    record("a. PutObject", false, errMsg(e));
  }

  // b. HeadObject
  try {
    const t0 = performance.now();
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const ok = head.ContentLength === local.length && head.ContentType === "audio/mpeg";
    record(
      "b. HeadObject",
      ok,
      `${ms(t0)}, size ${head.ContentLength}, type ${head.ContentType}, SSE ${head.ServerSideEncryption}`,
    );
  } catch (e) {
    record("b. HeadObject", false, errMsg(e));
  }

  // c. Presigned GET (7 days) + plain unsigned URL must be refused
  let signed = "";
  try {
    const t0 = performance.now();
    signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: KEY }), { expiresIn: TTL });
    console.log(`   presign took ${ms(t0)} (local signing, no network); url = ${redact(signed)}`);
    console.log(`   X-Amz-Expires=${new URL(signed).searchParams.get("X-Amz-Expires")}`);
    const t1 = performance.now();
    const res = await fetch(signed, { signal: AbortSignal.timeout(60_000) });
    const body = Buffer.from(await res.arrayBuffer());
    const ok = res.status === 200 && body.equals(local) && res.headers.get("content-type") === "audio/mpeg";
    record(
      "c. presigned GET",
      ok,
      `status ${res.status}, ${body.length} bytes, bytes match: ${body.equals(local)}, content-type ${res.headers.get("content-type")}, accept-ranges ${res.headers.get("accept-ranges")}, ${ms(t1)}`,
    );
  } catch (e) {
    record("c. presigned GET", false, errMsg(e));
  }
  try {
    const plain = signed ? signed.split("?")[0] : `${ENDPOINT}/${BUCKET}/${KEY}`;
    const res = await fetch(plain, { signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    record(
      "c. unsigned URL refused",
      res.status === 401 || res.status === 403,
      `status ${res.status} ${text.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  } catch (e) {
    record("c. unsigned URL refused", false, errMsg(e));
  }
  try {
    await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: KEY }), { expiresIn: TTL + 1 });
    console.log("   note: SDK accepted expiresIn > 7 days");
  } catch (e) {
    console.log(`   note: SDK rejects expiresIn > 7 days: ${errMsg(e).slice(0, 160)}`);
  }

  if (signed) {
    // d. Range request on the presigned URL (audio seeking)
    try {
      const t0 = performance.now();
      const res = await fetch(signed, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(30_000) });
      const body = Buffer.from(await res.arrayBuffer());
      const ok = res.status === 206 && body.length === 1024 && body.equals(local.subarray(0, 1024));
      record(
        "d. range request",
        ok,
        `status ${res.status}, ${body.length} bytes, content-range ${res.headers.get("content-range")}, ${ms(t0)}`,
      );
      const res2 = await fetch(signed, {
        headers: { Range: `bytes=${local.length - 1000}-` },
        signal: AbortSignal.timeout(30_000),
      });
      const tail = Buffer.from(await res2.arrayBuffer());
      console.log(
        `   tail range: status ${res2.status}, ${tail.length} bytes, match ${tail.equals(local.subarray(local.length - 1000))}`,
      );
    } catch (e) {
      record("d. range request", false, errMsg(e));
    }

    // e. Download timing from this PC (5 runs)
    try {
      const times: number[] = [];
      const ttfb: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const res = await fetch(signed, { signal: AbortSignal.timeout(60_000) });
        ttfb.push(performance.now() - t0);
        await res.arrayBuffer();
        times.push(performance.now() - t0);
      }
      const fmt = (a: number[]) => a.map((t) => t.toFixed(0)).join(", ");
      const median = [...times].sort((x, y) => x - y)[2];
      record(
        "e. download timing",
        true,
        `${local.length} bytes x5: total [${fmt(times)}] ms, headers [${fmt(ttfb)}] ms, median ${median.toFixed(0)} ms (~${((local.length * 8) / 1000 / median).toFixed(2)} Mbit/s)`,
      );
    } catch (e) {
      record("e. download timing", false, errMsg(e));
    }
  }

  // f. Delete and confirm it's gone
  try {
    const t0 = performance.now();
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const took = ms(t0);
    const after = await headOrNull();
    let presignedStatus = "n/a";
    if (signed) presignedStatus = String((await fetch(signed, { signal: AbortSignal.timeout(30_000) })).status);
    record(
      "f. DeleteObject",
      after === null,
      `${took}, head after delete: ${after === null ? "404" : "STILL THERE"}, old presigned URL now ${presignedStatus}`,
    );
  } catch (e) {
    record("f. DeleteObject", false, errMsg(e));
  }

  // f2. B2 keeps all versions by default: the plain delete above only added a delete marker ("hide").
  // Purge every version we created under spike/b2-probe/ so nothing billable is left behind.
  try {
    const v = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: KEY }));
    const entries = [...(v.Versions ?? []), ...(v.DeleteMarkers ?? [])].filter((x) => x.Key === KEY);
    console.log(`   versions left after plain delete: ${v.Versions?.length ?? 0} + ${v.DeleteMarkers?.length ?? 0} delete marker(s)`);
    for (const x of entries) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY, VersionId: x.VersionId }));
    const left = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: KEY }));
    const n = (left.Versions?.length ?? 0) + (left.DeleteMarkers?.length ?? 0);
    record("f2. purge all versions", n === 0, `${entries.length} entries deleted by VersionId, ${n} left`);
  } catch (e) {
    record("f2. purge all versions", false, errMsg(e));
  }

  console.log("\nSummary:");
  for (const [step, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${step}`);
}

main().catch((e) => {
  console.error("FAILED:", errMsg(e));
  process.exit(1);
});
