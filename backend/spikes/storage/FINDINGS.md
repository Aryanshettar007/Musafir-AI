# Spike 5 — Audio storage on Backblaze B2 (S3-compatible API)

> Throwaway spike, run 2026-10-10. Scripts in this folder are probes, not product code.
> Goal: store narrated mp3s in a **private** bucket and hand the app **time-limited presigned URLs** (~7 days),
> through the S3 API + AWS SDK v3 so we can move to Cloudflare R2 later by config only.

## Setup
- SDK: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (v3.1149, in `backend/package.json`).
- Discovery: B2 native `GET https://api.backblazeb2.com/b2api/v3/b2_authorize_account` (basic auth
  `keyId:applicationKey`) returns `apiInfo.storageApi.s3ApiUrl`; the region is the second label of that host.
  - S3 endpoint **`https://s3.us-east-005.backblazeb2.com`**, region **`us-east-005`**.
  - Bucket **`Musafir-AI`** (only one on the account): `allPrivate`, SSE-B2 (AES256) default, no CORS rules,
    **no lifecycle rules (keeps all versions)**.
- S3 credentials = B2 credentials: access key id = `B2_KEY_ID`, secret = `B2_APPLICATION_KEY`.
- Client: `new S3Client({ endpoint, region, credentials, forcePathStyle })`. No DNS workaround was needed.
- Probes:
  - `b2-authorize.ts`: endpoint, region, key capabilities, buckets. Prints no secrets.
  - `b2-probe.ts`: put → head → presign → fetch → range → timing → delete → purge versions. Only touches `spike/b2-probe/`.
  - `b2-cleanup.ts`: lists versions under `spike/b2-probe/` and, with `--delete`, removes them.

## Results (2 runs, from a PC in India, 99 072-byte Kannada mp3, key `spike/b2-probe/Girish.mp3`)
| Step | Result | Timing |
|---|---|---|
| a. PutObject, `ContentType: audio/mpeg` | ✓ | 1.9–2.6 s first call (TLS + round trips), then 0.44–0.74 s |
| b. HeadObject | ✓ size 99 072, `audio/mpeg`, SSE AES256 | 0.25–0.31 s |
| c. Presign GET, `expiresIn: 604800` | ✓ `X-Amz-Expires=604800` | 3 ms (local signing) |
| c. `fetch` presigned URL (no auth headers) | ✓ 200, bytes identical, `content-type: audio/mpeg`, `accept-ranges: bytes` | 1.9–2.4 s first fetch (new connection) |
| c. Plain URL without the query | ✓ **401** `UnauthorizedAccess` "bucket is not authorized" → private | — |
| d. `Range: bytes=0-1023` | ✓ **206**, 1 024 bytes, `content-range: bytes 0-1023/99072`; tail range also 206 | 0.26–0.33 s |
| e. Full download ×5 (keep-alive) | ✓ first byte ~270 ms; median total 0.41–0.57 s | 0.34–0.96 s |
| f. DeleteObject + HeadObject | ✓ 404; old presigned URL now 404 | ~1.1 s |
| f2. Purge versions | ✓ 3 versions + 1 delete marker removed by `VersionId`; prefix empty | — |

- Latency is mostly the round trip to US-East (~270 ms to the first byte): fine for pre-trip pack downloads and
  acceptable for streaming a story (playback can start after the first range response).
- The Content-Type set at upload comes back on the presigned GET; no response-override params needed.

## Env vars for the product
| Var | Value | Notes |
|---|---|---|
| `STORAGE_DRIVER` | `s3` | (`local` for dev/tests) |
| `S3_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` | R2: `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_REGION` | `us-east-005` | R2: `auto` |
| `S3_BUCKET` | `Musafir-AI` | |
| `S3_FORCE_PATH_STYLE` | `true` | see gotcha 2 |
| `S3_ACCESS_KEY_ID` | same as `B2_KEY_ID` | appears in presigned URLs (gotcha 4) |
| `S3_SECRET_ACCESS_KEY` | same as `B2_APPLICATION_KEY` | secret |
| `AUDIO_URL_TTL_SECONDS` | `604800` | must be ≤ 604 800, validated in config |

## Gotchas
1. **Max presign TTL is 7 days (604 800 s)**; the SDK throws above it. Store the object key, never the signed URL;
   re-sign whenever the app fetches a trip/pack (signing is local, ~3 ms).
2. **Path-style URLs**: `Musafir-AI` has capitals (not DNS-compatible), so the SDK silently used path style even with
   `forcePathStyle: false`. Set `forcePathStyle: true` explicitly (R2 accepts path style too).
3. **B2 keeps every version by default.** A plain `DeleteObject` only adds a delete marker; the bytes stay and are
   billed, and re-uploads to the same key stack versions. Delete by `VersionId` (`ListObjectVersions`) or set the
   bucket lifecycle to "keep only the last version".
4. **The current key is unrestricted, master-level** (writeKeys, deleteKeys, deleteBuckets, bypassGovernance, …) and
   its id is visible in every presigned URL (`X-Amz-Credential`). For the product, use a key restricted to
   `Musafir-AI` with only listFiles, readFiles, writeFiles, deleteFiles. Revoking a key kills every URL it signed.
5. **Checksums**: SDK v3 adds CRC32 to uploads and `x-amz-checksum-mode=ENABLED` to presigned GETs by default. B2
   accepts both; if another store doesn't, set `requestChecksumCalculation`/`responseChecksumValidation: "WHEN_REQUIRED"`.
6. **Range requests work** on presigned URLs (206 + `content-range`), so seeking and resume work.
7. **Region is US-East** (~270 ms TTFB from India). A CDN in front or R2 is a config-only switch since the code speaks S3.
8. **Presigned URLs are bearer tokens** until expiry: log the object key, never the full URL (redact `X-Amz-Signature`).
