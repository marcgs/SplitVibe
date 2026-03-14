#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> Killing any process on port 3000..."
lsof -ti:3000 | xargs kill 2>/dev/null || true

echo "==> Stopping docker services and removing volumes..."
docker compose down -v

echo "==> Environment torn down."
