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

## Getting Started

1. **Log in to Azure:**

   ```bash
   az login
   az account set --subscription <SUBSCRIPTION_ID>
   ```

2. **Configure environment variables** in `.env` (gitignored):

   ```bash
   POSTGRES_ADMIN_PASSWORD='<STRONG_PASSWORD>'
   NEXTAUTH_SECRET='<RANDOM_SECRET>'          # openssl rand -base64 32
   CUSTOM_DOMAIN_PROD='app.example.com'       # required for prod
   AUTH_GOOGLE_ID='<GOOGLE_CLIENT_ID>'
   AUTH_GOOGLE_SECRET='<GOOGLE_CLIENT_SECRET>'
   ```

3. **Provision infrastructure and deploy:**

   ```bash
   bin/infra dev           # provision dev Azure resources
   bin/deploy dev          # build, push, and deploy to dev

   bin/infra prod          # provision prod Azure resources
   bin/deploy prod         # build, push, and deploy to prod
   ```

   The checked-in parameter files default to `northeurope`. If you switch
   regions, keep the deployment location and the `location` parameter aligned.

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

## Custom Domain & TLS

Domain binding is handled imperatively by `bin/domain` (called automatically from `bin/deploy` when `customDomain` is set). This uses `az containerapp hostname` CLI commands instead of Bicep, avoiding the two-phase deployment that was previously needed.

```bash
bin/domain prod        # bind custom domain with managed TLS cert (idempotent)
```

The script adds the hostname, provisions a managed certificate (CNAME-validated), and binds it with SNI — all idempotently. If the domain is already bound with TLS, it skips.

**DNS prerequisites** — before the first deploy with a custom domain, create these records on your DNS provider:

| Type | Name | Value |
|------|------|-------|
| CNAME | `<customDomain>` | Container App FQDN (e.g. `ca-splitvibe-prod.<hash>.northeurope.azurecontainerapps.io`) |
| TXT | `asuid.<customDomain>` | Container Apps Environment custom domain verification ID |

The first deployment with a new domain takes ~5–10 extra minutes while Azure provisions the certificate. Subsequent deploys are idempotent and skip certificate provisioning.

## Auth URL behavior

`AUTH_URL` in the Container App is derived from deployment parameters:

- If `customDomain` is provided, `AUTH_URL=https://<customDomain>`.
- Otherwise, `AUTH_URL` uses `appUrl`.

For production environments with a bound custom domain, set `customDomain` (via secure CLI/pipeline variables, not committed parameter files) so redeployments don't revert Auth.js callback URLs to the default Container Apps FQDN.

## Re-running Deployments

Bicep deployments are **idempotent**. Re-running the same command will update existing resources without creating duplicates.
