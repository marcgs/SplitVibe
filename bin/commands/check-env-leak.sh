#!/usr/bin/env bash
# bin/sv check-env-leak — scan for leaked .env values
#   bin/sv check-env-leak              Scan staged diff (or working tree)
#   bin/sv check-env-leak --file PATH  Scan a single file
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env file found — nothing to check."
  exit 0
fi

# ---------- helpers ----------

scan_values() {
  # Reads .env, yields non-trivial secret values one per line via callback
  local target="$1"
  local leaked=""

  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    local value="${line#*=}"
    value="${value#\"}" ; value="${value%\"}"
    value="${value#\'}" ; value="${value%\'}"

    [[ -z "$value" ]] && continue
    (( ${#value} <= 4 )) && continue
    [[ "$value" == *"your-"*"here"* ]] && continue

    case "$value" in
      development|production|test|localhost|http://localhost:*|http://127.0.0.1:*) continue ;;
      devstoreaccount1|splitvibe-attachments) continue ;;
      https://api.frankfurter.app) continue ;;
    esac

    if grep -qF -- "$value" "$target"; then
      local var_name="${line%%=*}"
      leaked+="  - $var_name\n"
    fi
  done < "$ENV_FILE"

  echo -n "$leaked"
}

# ---------- mode: single file ----------

if [[ "${1:-}" == "--file" ]]; then
  FILE="${2:-}"
  [[ -z "$FILE" || ! -f "$FILE" ]] && exit 0

  # Skip .env files themselves
  case "$FILE" in *.env|*.env.*) exit 0 ;; esac

  LEAKED=$(scan_values "$FILE")

  if [[ -n "$LEAKED" ]]; then
    echo "🚨 Env value leak detected in $FILE!"
    echo "The following .env variable values were found in the file:"
    echo -e "$LEAKED"
    echo "Use variable references (e.g. process.env.VAR_NAME) instead of inline values."
    exit 1
  fi
  exit 0
fi

# ---------- mode: diff scan ----------

if git -C "$PROJECT_ROOT" diff --cached --quiet 2>/dev/null; then
  DIFF=$(git -C "$PROJECT_ROOT" diff)
  SCOPE="working tree"
else
  DIFF=$(git -C "$PROJECT_ROOT" diff --cached)
  SCOPE="staged changes"
fi

if [[ -z "$DIFF" ]]; then
  echo "No changes to scan."
  exit 0
fi

# Write diff to a temp file so scan_values can grep it
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
echo "$DIFF" > "$TMPFILE"

LEAKED=$(scan_values "$TMPFILE")

if [[ -n "$LEAKED" ]]; then
  echo "🚨 Env value leak detected in $SCOPE!"
  echo "The following .env variable values were found in the diff:"
  echo -e "$LEAKED"
  echo "Use variable references (e.g. process.env.VAR_NAME) instead of inline values."
  exit 1
fi

echo "✅ No leaked .env values found in $SCOPE."
