#!/usr/bin/env bash
set -euo pipefail

COMMANDS_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() { "$COMMANDS_DIR/env-down.sh"; }
trap cleanup EXIT
trap 'exit 0' INT TERM

"$COMMANDS_DIR/env-up.sh"

echo "==> Starting Next.js dev server (ctrl+c to stop)..."
"$COMMANDS_DIR/serve.sh"
