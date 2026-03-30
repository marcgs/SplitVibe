#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

ENV="${1:-}"
if [ -z "$ENV" ] || { [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; }; then
  echo "Usage: bin/sv env-vercel <dev|prod>" >&2
  exit 1
fi

# Check vercel CLI is installed
if ! command -v vercel &>/dev/null; then
  echo "==> Error: vercel CLI not found. Install with: npm i -g vercel" >&2
  exit 1
fi

VERCEL_ENV="preview"
[ "$ENV" = "prod" ] && VERCEL_ENV="production"

# Source .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

VARS=(
  DATABASE_URL
  AUTH_SECRET
  AUTH_GOOGLE_ID
  AUTH_GOOGLE_SECRET
  AZURE_STORAGE_CONNECTION_STRING
  AZURE_STORAGE_CONTAINER_NAME
  NEXT_PUBLIC_APP_URL
)

echo "==> Syncing environment variables to Vercel ($VERCEL_ENV)..."
for var in "${VARS[@]}"; do
  val="${!var:-}"
  if [ -n "$val" ]; then
    echo "$val" | vercel env add "$var" "$VERCEL_ENV" --force 2>/dev/null
    echo "    Set $var"
  else
    echo "    Skipped $var (not set)"
  fi
done

echo "==> Done."
