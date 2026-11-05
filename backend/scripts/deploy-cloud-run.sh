#!/usr/bin/env bash
# One-shot Cloud Run deploy: reads backend/.env, stores the sensitive values in Secret Manager, deploys the rest as
# plain env vars. Never prints values. Safe to re-run (adds a new secret version, redeploys).
# Usage (from backend/):  bash scripts/deploy-cloud-run.sh
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-musafir-ai-511509}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-musafir-api}"
SA_NAME="musafir-api"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

gcloud config set project "$PROJECT" >/dev/null
echo "==> Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com

echo "==> Service account $SA"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name "Musafir API"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/aiplatform.user --condition=None >/dev/null

# Source deploys build as the default compute service account, which new projects/orgs leave without build and
# storage access ("storage.objects.get denied"). The builder role covers storage, Artifact Registry and logs.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/cloudbuild.builds.builder roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$BUILD_SA" --role "$role" --condition=None >/dev/null
done

# Split .env: sensitive -> one file per secret + a "NAME=NAME:latest" list; the rest -> JSON env vars file.
node - "$WORK" <<'JS'
const fs = require("fs"), path = require("path");
const work = process.argv[2];
const d = require("dotenv").parse(fs.readFileSync(".env"));
const SECRET = /^(MONGODB_URI|GNANI_API_KEY\d*|GOOGLE_MAPS_API_KEY|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|APPLE_PRIVATE_KEY)$/;
// Not used by the server (Gemini key rotation is gone; B2_* are legacy) or reserved by Cloud Run (PORT).
const SKIP = /^(PORT|GEMINI_API_KEY\d*|B2_.*)$/;
const secrets = [], plain = {};
for (const [k, raw] of Object.entries(d)) {
  const v = raw.trim();
  if (!v || SKIP.test(k)) continue;
  if (SECRET.test(k)) { fs.writeFileSync(path.join(work, k), v); secrets.push(k); }
  else plain[k] = v;
}
plain.NODE_ENV = "production";
fs.writeFileSync(path.join(work, "env.json"), JSON.stringify(plain));
fs.writeFileSync(path.join(work, "secrets.txt"), secrets.join("\n"));
console.log(`secrets: ${secrets.join(", ")}\nplain env vars: ${Object.keys(plain).join(", ")}`);
JS

echo "==> Secret Manager"
SET_SECRETS=""
while read -r name; do
  [ -z "$name" ] && continue
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets versions add "$name" --data-file "$WORK/$name" >/dev/null
  else
    gcloud secrets create "$name" --data-file "$WORK/$name" >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
  SET_SECRETS="${SET_SECRETS:+$SET_SECRETS,}$name=$name:latest"
done < "$WORK/secrets.txt"

echo "==> Deploying $SERVICE to $REGION"
# max-instances 1: the Gnani queue and rate limiters are in-process. no-cpu-throttling: trips build in the background.
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --service-account "$SA" --allow-unauthenticated \
  --max-instances 1 --no-cpu-throttling --memory 1Gi --timeout 300 \
  --env-vars-file "$WORK/env.json" --set-secrets "$SET_SECRETS"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "==> Done: $URL"
curl -s -m 20 "$URL/health" || true; echo
