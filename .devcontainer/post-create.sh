#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing dependencies..."
npm ci

echo "==> Installing Playwright browsers..."
npx playwright install --with-deps chromium

echo ""
echo "========================================="
echo "  Dev container ready!"
echo "  Run 'npm run dev' to start the dev server."
echo "========================================="
