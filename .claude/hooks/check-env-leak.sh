#!/usr/bin/env bash
# PostToolUse hook: blocks edits that contain resolved .env values.
# Reads the Claude tool-use JSON payload from stdin.

set -euo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE" ]]; then
  exit 0
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
"$PROJECT_ROOT/bin/sv" check-env-leak --file "$FILE"
