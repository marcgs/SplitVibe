#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

e2e=false
watch=false
args=()

for arg in "$@"; do
  case "$arg" in
    --e2e)  e2e=true ;;
    --watch) watch=true ;;
    *)      args+=("$arg") ;;
  esac
done

if [ "$e2e" = true ]; then
  echo "==> Running Playwright e2e tests..."
  npx playwright test "${args[@]+"${args[@]}"}"
elif [ "$watch" = true ]; then
  echo "==> Running Vitest in watch mode..."
  npx vitest "${args[@]+"${args[@]}"}"
else
  echo "==> Running Vitest..."
  npx vitest run "${args[@]+"${args[@]}"}"
fi
