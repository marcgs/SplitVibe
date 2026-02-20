#!/usr/bin/env bash
# PostToolUse hook: runs tsc + eslint on edited TypeScript files.
# Reads the Claude tool-use JSON payload from stdin.

set -euo pipefail

# Parse the file path from the JSON payload on stdin
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path found
if [[ -z "$FILE" ]]; then
  exit 0
fi

# Only process TypeScript / TSX files
if [[ "$FILE" != *.ts && "$FILE" != *.tsx ]]; then
  exit 0
fi

echo "🔍 Lint/type-check: $FILE"

# Type-check the whole project
echo "→ tsc --noEmit"
npx tsc --noEmit

# Lint the specific file
echo "→ eslint $FILE"
npx eslint "$FILE"

echo "✅ Passed"
