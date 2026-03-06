#!/bin/sh
set -e
echo "Running database migrations..."
# NODE_PATH makes prisma.config.ts resolve `prisma/config` and `dotenv`
# from the globally-installed packages (standalone output omits both).
NODE_PATH=/usr/local/lib/node_modules prisma migrate deploy
echo "Starting application..."
exec node server.js
