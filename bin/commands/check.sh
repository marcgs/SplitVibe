#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> Step 1/3: Typecheck"
npm run typecheck

echo "==> Step 2/3: Lint"
npm run lint

echo "==> Step 3/3: Tests"
npx vitest run

echo "==> All checks passed."
