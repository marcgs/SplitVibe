#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

ENV="${1:-}"
if [ -z "$ENV" ] || { [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; }; then
  echo "Usage: bin/sv domain <dev|prod>" >&2
  exit 1
fi

# Source .env if present
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Resolve per-environment CUSTOM_DOMAIN
ENV_UPPER=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
ENV_DOMAIN_VAR="CUSTOM_DOMAIN_$ENV_UPPER"
CUSTOM_DOMAIN="${!ENV_DOMAIN_VAR:-${CUSTOM_DOMAIN:-}}"

if [ -z "$CUSTOM_DOMAIN" ]; then
  echo "==> No CUSTOM_DOMAIN set for $ENV — skipping domain binding."
  exit 0
fi

RESOURCE_GROUP="rg-splitvibe-$ENV"
CONTAINER_APP="ca-splitvibe-$ENV"

# Check if hostname is already bound with a certificate (SniEnabled)
echo "==> Checking existing hostname bindings for $CUSTOM_DOMAIN..."
EXISTING=$(az containerapp hostname list \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?name=='$CUSTOM_DOMAIN'].bindingType" -o tsv 2>/dev/null || echo "")

if [ "$EXISTING" = "SniEnabled" ]; then
  echo "==> Domain $CUSTOM_DOMAIN is already bound with TLS — nothing to do."
  exit 0
fi

# Step 1: Register the hostname on the Container App
echo "==> Adding hostname $CUSTOM_DOMAIN..."
az containerapp hostname add \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname "$CUSTOM_DOMAIN"

# Step 2: Provision managed certificate and bind with SNI
echo "==> Binding managed TLS certificate for $CUSTOM_DOMAIN (CNAME validation)..."
az containerapp hostname bind \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname "$CUSTOM_DOMAIN" \
  --environment "cae-splitvibe-$ENV" \
  --validation-method CNAME

echo "==> Domain $CUSTOM_DOMAIN bound with managed TLS certificate."
