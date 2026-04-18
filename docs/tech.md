# SplitVibe — Technical Specification

**Version:** 0.1
**Date:** 2026-02-20
**Status:** Final

---

## 1. Overview

This document captures the technology choices and architecture for SplitVibe. All decisions are made in the context of a small-to-medium personal/family app with a primary deployment target of Microsoft Azure and a strong requirement for efficient local development.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Next.js (App Router) | Full-stack React framework; SSR, API route handlers, and PWA support in one package. |
| **Language** | TypeScript | End-to-end type safety across frontend and backend. |
| **UI** | Tailwind CSS + shadcn/ui | Utility-first styling with accessible, composable components copied directly into the project. |
| **Auth** | Auth.js v5 (NextAuth) | Built-in Google and Apple OAuth providers; Prisma adapter for session persistence. |
| **ORM** | Prisma | Schema-first, type-safe database access; first-class Postgres support and migration tooling. |
| **Database** | PostgreSQL | Relational model suits financial/transactional data and complex balance queries. |
| **File storage** | Azure Blob Storage | Native Azure object storage with signed-URL access for attachment serving. |
| **FX rates** | Frankfurter API | Free, no API key, ECB-backed exchange rate data; fetched and cached daily. |

---

## 3. Repository Structure

Single monorepo. Frontend and backend (API route handlers) live together in one Next.js project.

```
splitvibe/
├── app/                  # Next.js App Router (pages, layouts, API routes)
│   ├── api/              # Route handlers (REST endpoints)
│   └── (routes)/         # UI pages
├── components/           # Shared React components (shadcn/ui + custom)
├── lib/                  # Shared utilities (auth, db client, FX, storage)
├── prisma/               # Prisma schema and migrations
├── public/               # Static assets
├── docs/                 # Project documentation
├── .env.local            # Local environment variables (not committed)
├── docker-compose.yml    # Local development services
├── Dockerfile            # Production container image
└── next.config.ts        # Next.js configuration
```

---

## 4. Local Development

All backing services run as Docker containers via Docker Compose, providing full parity with production.

### Services (docker-compose.yml)

| Service | Image | Purpose |
|---------|-------|---------|
| `app` | Local Dockerfile (dev target) | Next.js dev server with hot reload |
| `db` | `postgres:16-alpine` | Local PostgreSQL instance |
| `storage` | `mcr.microsoft.com/azure-storage/azurite` | Azure Blob Storage emulator |

### Workflow

```bash
docker compose up          # Start all services
docker compose exec app npx prisma migrate dev   # Run migrations
docker compose down        # Stop all services
```

Environment variables for local development are set in `.env.local` (not committed). A `.env.example` file documents all required variables.

---

## 5. Deployment Architecture (Azure)

```
GitHub
  │
  │  push to main
  ▼
GitHub Actions
  ├── Run tests
  ├── Build Docker image
  ├── Push to Azure Container Registry (ACR)
  └── Deploy to Azure Container Apps
            │
            ├── Next.js App (Container App)
            │     ├── Serves UI (SSR / static)
            │     └── Handles API requests
            │
            ├── Azure Database for PostgreSQL – Flexible Server
            │
            └── Azure Blob Storage (attachments)
```

### Azure Resources

| Resource | Purpose |
|----------|---------|
| **Azure Container Registry** | Stores Docker images built by CI |
| **Azure Container Apps** | Hosts the Next.js application; scales to zero when idle |
| **Azure Database for PostgreSQL – Flexible Server** | Managed Postgres; private VNet access from Container Apps |
| **Azure Blob Storage** | Expense attachments; served via short-lived signed URLs |

### Scaling & Cost

- Container Apps scales to zero replicas when there is no traffic — minimising cost for a personal app.
- PostgreSQL Flexible Server uses the Burstable tier (lowest cost) for v1.

---

## 6. CI/CD (GitHub Actions)

Two workflows:

### `ci.yml` — runs on every pull request
1. Install dependencies
2. Type-check (`tsc --noEmit`)
3. Lint (`eslint`)
4. Run tests
5. Build Next.js (smoke-check)

### `deploy.yml` — runs on merge to `main`
1. Build Docker image
2. Push to Azure Container Registry
3. Deploy new revision to Azure Container Apps
4. Run Prisma migrations against the production database

---

## 7. Authentication Flow

1. User clicks "Sign in with Google / Apple".
2. Auth.js handles the OAuth redirect and callback.
3. On first login, Auth.js creates a `User` record via the Prisma adapter.
4. Sessions are stored in the database (not JWT) for easy revocation.
5. All API route handlers verify the session server-side before processing requests.

---

## 8. File Attachment Flow

**Upload:**
1. Client requests a pre-signed upload URL from the API (`POST /api/attachments/presign`).
2. API generates a short-lived Azure Blob Storage SAS URL and returns it.
3. Client uploads the file directly to Blob Storage (no file bytes pass through the app server).
4. Client notifies the API of the completed upload; API saves the blob reference to the database.

**Download:**
1. Client requests a download URL from the API (`GET /api/attachments/:id`).
2. API verifies the requester is a member of the relevant group, then returns a short-lived SAS read URL.
3. Client fetches the file directly from Blob Storage.

---

## 9. FX Rate Caching

- A background job (Next.js cron route or an Azure Container App job) calls the Frankfurter API once per day.
- Rates are stored in a `ExchangeRate` table in Postgres (`from_currency`, `to_currency`, `rate`, `date`).
- When an expense is created, the current cached rate is looked up and stored directly on the `Expense` record — it is never changed afterwards.

---

## 10. Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `NEXTAUTH_SECRET` | Auth.js signing secret |
| `NEXTAUTH_URL` | Public base URL of the app |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_APPLE_ID` | Apple OAuth client ID |
| `AUTH_APPLE_SECRET` | Apple OAuth client secret |
| `AZURE_STORAGE_ACCOUNT_NAME` | Blob Storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Blob Storage account key |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container name for attachments |

---

## 11. Agentic workflows

We use [GitHub Agentic Workflows (`gh-aw`)](https://github.github.com/gh-aw/) to
run scheduled, read-only agents that produce structured output (PRs and
issues) through gh-aw's safe-output gates. The agent itself receives only
read permissions; all writes are performed by separate, permission-controlled
jobs after a built-in threat-detection step.

### Setup

Install the `gh-aw` GitHub CLI extension locally to author and compile
workflows:

```bash
gh extension install githubnext/gh-aw
gh aw compile             # regenerate all .lock.yml files after editing a workflow
```

Each workflow lives at `.github/workflows/<name>.md` and is committed
alongside its generated `.lock.yml` file (the file GitHub Actions actually
runs). Both files must be committed.

### Required secret

| Secret | Purpose |
|--------|---------|
| `COPILOT_GITHUB_TOKEN` | Token used by the gh-aw Copilot CLI engine. Configure in repository **Settings → Secrets and variables → Actions**. Never commit the value. |

### Documentation Maintainer

**File:** `.github/workflows/docs-maintainer.md`
**Engine:** GitHub Copilot CLI (gh-aw default)
**Schedule:** daily at 06:00 UTC, plus manual `workflow_dispatch`

The agent compares recent `main`-branch commits (the last 24 hours, capped
at the 50 most recent commits) against `docs/spec.md`, `docs/tech.md`, and
`README.md`, and:

- Opens **at most one draft pull request** per run when a single doc file
  needs ≤ 30 lines of mechanical edits (renamed env var, new API route to
  list, updated CLI command, stale path, broken link). PRs are titled with
  the `[docs]` prefix, labeled `documentation` and `agentic`, and use a
  branch under `agent/docs-maintainer/`. The safe-output gate enforces an
  `allowed-files` allow-list so the PR can only modify the three target
  doc files.
- Files **at most two issues** per run (titled `[docs-drift] ...`, same
  labels) when drift is structural, conceptual, or larger than the PR
  threshold.
- Excludes `docs/adr/**` (immutable ADRs), `docs/backlog.md` (human-owned),
  and all generated/lock files from analysis.
- Runs gh-aw's built-in threat-detection job before any safe output is
  applied; flagged output blocks the workflow.

**Trigger manually:** Actions tab → *Documentation Maintainer* → **Run
workflow** (or `gh workflow run docs-maintainer.lock.yml`).

**Disable:** Actions tab → *Documentation Maintainer* → **Disable
workflow**, or run `gh aw disable docs-maintainer`. To remove permanently,
delete `.github/workflows/docs-maintainer.md` and `.lock.yml`.

**Interpreting outputs:**

- A `[docs]`-prefixed draft PR → review like any small docs PR; merge if
  the change is correct.
- A `[docs-drift]`-prefixed issue → human or follow-up agent triages and
  schedules the larger doc update.
- No PR or issue → the agent found no actionable drift in the analysis
  window.

The workflow runs only on `schedule` and `workflow_dispatch`, so pull
request events (including PRs from forks) cannot trigger it. The required
`COPILOT_GITHUB_TOKEN` secret is also not available on forks.
