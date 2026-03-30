#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

ENV="${1:-}"
if [ -z "$ENV" ] || { [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; }; then
  echo "Usage: bin/sv deploy-vercel <dev|prod>" >&2
  exit 1
fi

# Source .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Check vercel CLI is installed
if ! command -v vercel &>/dev/null; then
  echo "==> Error: vercel CLI not found. Install with: npm i -g vercel" >&2
  exit 1
fi

# Validate required env vars
missing=()
[ -z "${DATABASE_URL:-}" ] && missing+=("DATABASE_URL")
[ -z "${AUTH_SECRET:-}" ] && missing+=("AUTH_SECRET")
[ -z "${AUTH_GOOGLE_ID:-}" ] && missing+=("AUTH_GOOGLE_ID")
[ -z "${AUTH_GOOGLE_SECRET:-}" ] && missing+=("AUTH_GOOGLE_SECRET")

if [ ${#missing[@]} -gt 0 ]; then
  echo "==> Error: missing required environment variables:" >&2
  for var in "${missing[@]}"; do
    echo "    - $var" >&2
  done
  exit 1
fi

# Run migrations against the target database
echo "==> Running database migrations..."
npx prisma migrate deploy

# Deploy to Vercel
if [ "$ENV" = "prod" ]; then
  echo "==> Deploying to Vercel (production)..."
  vercel deploy --prod
else
  echo "==> Deploying to Vercel (preview)..."
  vercel deploy
fi

echo "==> Vercel deployment complete."
