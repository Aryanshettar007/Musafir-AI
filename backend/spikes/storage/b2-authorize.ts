// SPIKE (throwaway): B2 native b2_authorize_account — discover S3 endpoint, region, key capabilities, bucket.
// Prints NO secrets (no key id, application key or auth token).
// Run: npx tsx spikes/storage/b2-authorize.ts
import "dotenv/config";
import dns from "node:dns";
if (process.env.SPIKE_DNS) dns.setServers(["8.8.8.8", "4.2.2.2"]);

const { B2_KEY_ID, B2_APPLICATION_KEY } = process.env;
if (!B2_KEY_ID || !B2_APPLICATION_KEY) throw new Error("B2_KEY_ID / B2_APPLICATION_KEY missing from backend/.env");

type Auth = {
  accountId: string;
  authorizationToken: string;
  apiInfo: {
    storageApi: {
      apiUrl: string;
      s3ApiUrl: string;
      capabilities: string[];
      allowed?: { buckets?: Array<{ id: string; name: string | null }> | null; namePrefix?: string | null };
      bucketId?: string | null;
      bucketName?: string | null;
      namePrefix?: string | null;
    };
  };
};

async function main() {
  const res = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: "Basic " + Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString("base64") },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`authorize ${res.status} ${(await res.text()).slice(0, 300)}`);
  const auth = (await res.json()) as Auth;
  const s = auth.apiInfo.storageApi;
  const region = new URL(s.s3ApiUrl).hostname.split(".")[1];
  console.log("s3ApiUrl:", s.s3ApiUrl);
  console.log("region:", region);
  console.log("capabilities:", s.capabilities.join(", "));
  console.log("allowed:", JSON.stringify(s.allowed ?? { bucketId: s.bucketId, bucketName: s.bucketName, namePrefix: s.namePrefix }));

  if (s.capabilities.includes("listBuckets")) {
    const allowedBucket = s.allowed?.buckets?.[0];
    const body: Record<string, string> = { accountId: auth.accountId };
    if (allowedBucket) body.bucketId = allowedBucket.id;
    const lb = await fetch(`${s.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await lb.json()) as { buckets?: Array<{ bucketName: string; bucketType: string; bucketId: string; corsRules?: unknown[]; lifecycleRules?: unknown[]; defaultServerSideEncryption?: unknown }> };
    if (!lb.ok) console.log("list_buckets failed:", lb.status, JSON.stringify(json).slice(0, 300));
    for (const b of json.buckets ?? [])
      console.log(`bucket: ${b.bucketName} (${b.bucketId}) type=${b.bucketType} cors=${JSON.stringify(b.corsRules)} lifecycle=${JSON.stringify(b.lifecycleRules)} sse=${JSON.stringify(b.defaultServerSideEncryption)}`);
  } else {
    console.log("key lacks listBuckets capability");
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
