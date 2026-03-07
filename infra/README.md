# SplitVibe — Azure Infrastructure (Bicep)

This directory contains the Infrastructure-as-Code (IaC) templates for provisioning all Azure resources needed to run SplitVibe in production.

## Directory Structure

```
infra/
├── main.bicep                        # Orchestrator — deploys all modules
├── modules/
│   ├── containerApps.bicep           # Container Apps Environment + Container App
│   ├── containerRegistry.bicep       # Azure Container Registry
│   ├── keyVault.bicep                # Key Vault with application secrets
│   ├── logAnalytics.bicep            # Log Analytics workspace
│   ├── managedIdentity.bicep         # User-assigned managed identity
│   ├── networking.bicep              # VNet, subnets, private DNS zone
│   ├── postgres.bicep                # PostgreSQL Flexible Server
│   ├── roleAssignment.bicep          # Generic RBAC role assignment helper
│   └── storage.bicep                 # Blob Storage account + attachments container
├── parameters/
│   ├── dev.parameters.json           # Dev environment parameter values
│   └── prod.parameters.json          # Prod environment parameter values
└── README.md                         # This file
```

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) v2.61+
- An active Azure subscription
- Contributor + User Access Administrator (or Owner) role on the subscription

## One-Time Bootstrap

1. **Log in to Azure:**

   ```bash
   az login
   az account set --subscription <SUBSCRIPTION_ID>
   ```

2. **Deploy the dev environment:**

   The dev environment deploys with the Azure Container Apps placeholder image
   (`mcr.microsoft.com/k8se/quickstart:latest`) listening on port 80.
   Google OAuth parameters are optional for initial bootstrap. The checked-in
   parameter files default to `northeurope`, which has been reliable for Azure
   Container Apps capacity during validation; if you switch regions, keep the
   deployment location and the `location` parameter aligned.

   ```bash
   az deployment sub create \
     --location northeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/dev.parameters.json \
     --parameters postgresAdminPassword='<STRONG_PASSWORD>' \
     --parameters nextAuthSecret='<RANDOM_SECRET>'
   ```

   Generate a strong random secret with:

   ```bash
   openssl rand -base64 32
   ```

3. **Deploy the prod environment:**

   When deploying with the SplitVibe application image, supply the Google
   OAuth credentials, custom domain, and the container image reference:

   ```bash
    az deployment sub create \
      --location northeurope \
      --template-file infra/main.bicep \
      --parameters infra/parameters/prod.parameters.json \
      --parameters postgresAdminPassword='<STRONG_PASSWORD>' \
      --parameters nextAuthSecret='<RANDOM_SECRET>' \
      --parameters customDomain='<CUSTOM_DOMAIN>' \
      --parameters authGoogleId='<GOOGLE_CLIENT_ID>' \
      --parameters authGoogleSecret='<GOOGLE_CLIENT_SECRET>' \
      --parameters containerImage='<ACR_LOGIN_SERVER>/splitvibe:<TAG>'
   ```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `location` | Yes | — | Azure region (set in `.parameters.json`) |
| `environment` | Yes | — | `dev` or `prod` (set in `.parameters.json`) |
| `baseName` | No | `splitvibe` | Base name for resource naming |
| `postgresAdminLogin` | Yes | — | PostgreSQL admin username (set in `.parameters.json`) |
| `postgresAdminPassword` | Yes | — | PostgreSQL admin password (**supply via CLI**) |
| `nextAuthSecret` | Yes | — | Auth.js signing secret (**supply via CLI**) |
| `containerImage` | No | quickstart | Container image to deploy |
| `targetPort` | No | `3000` | Container port (`80` for quickstart, `3000` for SplitVibe) |
| `appUrl` | No | `''` | Public URL for Auth.js fallback (used when `customDomain` is not provided) |
| `customDomain` | No | `''` | Public custom hostname (for example `app.example.com`); when set, `AUTH_URL` is derived as `https://<customDomain>` |
| `authGoogleId` | No | `''` | Google OAuth client ID |
| `authGoogleSecret` | No | `''` | Google OAuth client secret (**supply via CLI**) |

## What Gets Created

| Resource | Purpose |
|----------|---------|
| **Resource Group** (`rg-splitvibe-<env>`) | Contains all resources for the environment |
| **Virtual Network** | Isolates PostgreSQL from the public internet |
| **User-Assigned Managed Identity** | Shared identity for the Container App |
| **Azure Container Registry** | Stores Docker images (Basic SKU dev / Standard SKU prod) |
| **Azure Container Apps** | Hosts the Next.js application; scales to zero |
| **PostgreSQL Flexible Server** | Managed Postgres (Burstable B1ms); VNet-integrated |
| **Blob Storage** | `attachments` container with private-only access |
| **Key Vault** | Stores `DATABASE_URL`, `NEXTAUTH_SECRET`, and other credentials |
| **Log Analytics** | Collects Container App logs and diagnostics |

## Managed Identity & RBAC

The Container App uses a **user-assigned Managed Identity** with the following roles:

| Role | Scope |
|------|-------|
| `AcrPull` | Container Registry |
| `Storage Blob Data Contributor` | Blob Storage account |
| `Key Vault Secrets User` | Key Vault |

Storage is accessed exclusively via the Managed Identity (`AZURE_CLIENT_ID` is
injected as an environment variable for `DefaultAzureCredential`). No storage
account keys are passed to the Container App.

## Security

- **No secrets in parameter files.** All secrets (`postgresAdminPassword`, `nextAuthSecret`, `authGoogleSecret`) are passed at deployment time via CLI parameters or CI pipeline secrets.
- **PostgreSQL** is VNet-integrated and not reachable from the public internet.
- **Blob Storage** has `allowBlobPublicAccess: false` — accessible only via the Managed Identity (no account keys are injected).
- **Key Vault** uses RBAC authorization; only the Container App's Managed Identity has `Secrets User` access.

## Auth URL behavior

`AUTH_URL` in the Container App is derived from deployment parameters:

- If `customDomain` is provided, `AUTH_URL=https://<customDomain>`.
- Otherwise, `AUTH_URL` uses `appUrl`.

For production environments with a bound custom domain, set `customDomain` (via secure CLI/pipeline variables, not committed parameter files) so redeployments don't revert Auth.js callback URLs to the default Container Apps FQDN.

## Re-running Deployments

Bicep deployments are **idempotent**. Re-running the same command will update existing resources without creating duplicates.

## CI/CD Integration

In your GitHub Actions `deploy.yml` workflow, use the Azure CLI to deploy:

```yaml
- name: Deploy infrastructure
  uses: azure/cli@v2
  with:
    inlineScript: |
      az deployment sub create \
        --location northeurope \
        --template-file infra/main.bicep \
        --parameters infra/parameters/prod.parameters.json \
        --parameters postgresAdminPassword='${{ secrets.POSTGRES_ADMIN_PASSWORD }}' \
        --parameters nextAuthSecret='${{ secrets.NEXTAUTH_SECRET }}' \
        --parameters customDomain='${{ secrets.CUSTOM_DOMAIN }}' \
        --parameters authGoogleId='${{ secrets.AUTH_GOOGLE_ID }}' \
        --parameters authGoogleSecret='${{ secrets.AUTH_GOOGLE_SECRET }}' \
        --parameters containerImage='${{ env.ACR_LOGIN_SERVER }}/splitvibe:${{ github.sha }}' \
        --parameters targetPort=3000
```
