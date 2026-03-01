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
│   ├── networking.bicep              # VNet, subnets, private DNS zone
│   ├── postgres.bicep                # PostgreSQL Flexible Server
│   ├── roleAssignment.bicep          # Generic RBAC role assignment helper
│   └── storage.bicep                 # Blob Storage account + attachments container
├── parameters/
│   ├── dev.bicepparam                # Dev environment parameter values
│   └── prod.bicepparam               # Prod environment parameter values
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

   ```bash
   az deployment sub create \
     --location westeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/dev.bicepparam \
     --parameters postgresAdminPassword='<STRONG_PASSWORD>' \
     --parameters nextAuthSecret='<RANDOM_SECRET>'
   ```

   Generate a strong random secret with:

   ```bash
   openssl rand -base64 32
   ```

3. **Deploy the prod environment:**

   ```bash
   az deployment sub create \
     --location westeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/prod.bicepparam \
     --parameters postgresAdminPassword='<STRONG_PASSWORD>' \
     --parameters nextAuthSecret='<RANDOM_SECRET>'
   ```

## What Gets Created

| Resource | Purpose |
|----------|---------|
| **Resource Group** (`rg-splitvibe-<env>`) | Contains all resources for the environment |
| **Virtual Network** | Isolates PostgreSQL from the public internet |
| **Azure Container Registry** | Stores Docker images (Basic SKU dev / Standard SKU prod) |
| **Azure Container Apps** | Hosts the Next.js application; scales to zero |
| **PostgreSQL Flexible Server** | Managed Postgres (Burstable B1ms); VNet-integrated |
| **Blob Storage** | `attachments` container with private-only access |
| **Key Vault** | Stores `DATABASE_URL`, `NEXTAUTH_SECRET`, and storage credentials |
| **Log Analytics** | Collects Container App logs and diagnostics |

## Managed Identity & RBAC

The Container App receives a **system-assigned Managed Identity** with the following roles:

| Role | Scope |
|------|-------|
| `AcrPull` | Container Registry |
| `Storage Blob Data Contributor` | Blob Storage account |
| `Key Vault Secrets User` | Key Vault |

## Security

- **No secrets in parameter files.** All secrets (`postgresAdminPassword`, `nextAuthSecret`) are passed at deployment time via CLI parameters or CI pipeline secrets.
- **PostgreSQL** is VNet-integrated and not reachable from the public internet.
- **Blob Storage** has `allowBlobPublicAccess: false` — only the Managed Identity (and SAS tokens) can access blobs.
- **Key Vault** uses RBAC authorization; only the Container App's Managed Identity has `Secrets User` access.

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
        --location westeurope \
        --template-file infra/main.bicep \
        --parameters infra/parameters/prod.bicepparam \
        --parameters postgresAdminPassword='${{ secrets.POSTGRES_ADMIN_PASSWORD }}' \
        --parameters nextAuthSecret='${{ secrets.NEXTAUTH_SECRET }}' \
        --parameters containerImage='${{ env.ACR_LOGIN_SERVER }}/splitvibe:${{ github.sha }}'
```
