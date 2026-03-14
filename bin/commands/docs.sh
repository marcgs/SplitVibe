#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Map topic names to source files (relative to PROJECT_ROOT)
declare -A TOPICS=(
  [spec]="docs/spec.md"
  [tech]="docs/tech.md"
  [backlog]="docs/backlog.md"
  [api-routes]=".github/instructions/api-routes.instructions.md"
  [prisma]=".github/instructions/prisma.instructions.md"
  [react]=".github/instructions/react.instructions.md"
  [tests]=".github/instructions/tests.instructions.md"
  [typescript]=".github/instructions/typescript.instructions.md"
  [adr-001-database]="docs/adr/001-database.md"
  [adr-002-agentic-ci]="docs/adr/002-agentic-ci-workflow.md"
)

# Descriptions for listing
declare -A DESCRIPTIONS=(
  [spec]="Product requirements and domain rules"
  [tech]="Architecture, auth flow, deployment, env vars"
  [backlog]="Story dependencies and context"
  [api-routes]="API route handler conventions"
  [prisma]="Prisma schema and migration conventions"
  [react]="React / Next.js component conventions"
  [tests]="Testing conventions (Vitest + Playwright)"
  [typescript]="TypeScript coding conventions"
  [adr-001-database]="ADR: Database selection (PostgreSQL)"
  [adr-002-agentic-ci]="ADR: Agentic CI workflow"
)

# Stable display order
ORDERED_TOPICS=(
  spec tech backlog
  api-routes prisma react tests typescript
  adr-001-database adr-002-agentic-ci
)

TOPIC="${1:-}"

if [ -z "$TOPIC" ]; then
  echo "Available documentation topics:"
  echo ""
  for t in "${ORDERED_TOPICS[@]}"; do
    printf "  %-20s %s\n" "$t" "${DESCRIPTIONS[$t]}"
  done
  echo ""
  echo "Usage: bin/sv docs <topic>"
  exit 0
fi

if [ -z "${TOPICS[$TOPIC]+exists}" ]; then
  echo "Error: unknown topic '$TOPIC'" >&2
  echo "Run 'bin/sv docs' to see available topics." >&2
  exit 1
fi

FILE="$PROJECT_ROOT/${TOPICS[$TOPIC]}"

if [ ! -f "$FILE" ]; then
  echo "Error: source file not found: ${TOPICS[$TOPIC]}" >&2
  exit 1
fi

cat "$FILE"
