#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

FILE="${1:-}"

echo "==> Running typecheck..."
npm run typecheck

if [ -n "$FILE" ]; then
  echo "==> Running lint on $FILE..."
  npx eslint "$FILE"
else
  echo "==> Running lint..."
  npm run lint
fi
