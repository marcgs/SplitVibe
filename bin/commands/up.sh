#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> Starting docker services (db + storage)..."
docker compose up -d --force-recreate --remove-orphans

echo "==> Waiting for database to be ready..."
retries=0
if [ "${DEVCONTAINER:-}" = "1" ]; then
  # In the devcontainer, check via the host port mapping that Prisma will use
  until pg_isready -h host.docker.internal -p 5432 -U postgres > /dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge 30 ]; then
      echo "==> Error: database not reachable at host.docker.internal:5432 after 30 retries" >&2
      exit 1
    fi
    sleep 1
  done
else
  until docker compose exec -T db pg_isready -U postgres > /dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge 30 ]; then
      echo "==> Error: database not ready after 30 retries" >&2
      exit 1
    fi
    sleep 1
  done
fi
echo "==> Database is ready."

echo "==> Generating Prisma client and running migrations..."
npm run db:generate
npm run db:migrate

echo "==> Backend services are up."
