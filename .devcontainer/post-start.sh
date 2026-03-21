#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Start backend services on the host Docker daemon
echo "==> Starting docker services (db + storage)..."
docker compose up -d --force-recreate --remove-orphans

# Wait for the database to be reachable via host.docker.internal
# (docker compose exec pg_isready checks inside the container, but the
# host port mapping may take a moment longer to be established)
echo "==> Waiting for database at host.docker.internal:5432..."
retries=0
until pg_isready -h host.docker.internal -p 5432 -U postgres > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ "$retries" -ge 30 ]; then
    echo "==> Error: database not reachable at host.docker.internal:5432 after 30 retries" >&2
    exit 1
  fi
  sleep 1
done
echo "==> Database is ready."

echo "==> Generating Prisma client and running migrations..."
npm run db:generate
npm run db:migrate

echo "==> Backend services are up."
