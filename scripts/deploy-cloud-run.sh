#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-aura-backend}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID is required. Example: PROJECT_ID=your-gcp-project-id" >&2
  exit 1
fi

if [[ -z "${GOOGLE_GENAI_API_KEY:-}" ]]; then
  echo "GOOGLE_GENAI_API_KEY is required." >&2
  exit 1
fi

if [[ -z "${FIREBASE_PROJECT_ID:-}" ]]; then
  echo "FIREBASE_PROJECT_ID is required." >&2
  exit 1
fi

# Authenticate and set project (assumes gcloud is installed)
gcloud auth login --quiet

gcloud config set project "$PROJECT_ID"

gcloud run deploy "$SERVICE_NAME" \
  --source ./server \
  --region "$REGION" \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars "GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION}"

echo "Deploy complete. Set client envs:"
echo "  NEXT_PUBLIC_API_BASE_URL=https://$SERVICE_NAME-<hash>-$REGION.a.run.app"
echo "  NEXT_PUBLIC_WS_BASE_URL=wss://$SERVICE_NAME-<hash>-$REGION.a.run.app"
