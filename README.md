# SplitVibe

Shared expense tracking for friends and family. Create groups, add expenses with flexible split modes, track balances, and settle up — with multi-currency support and receipt attachments.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma · PostgreSQL · Azure Blob Storage

---

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 20+

## Local Development

```bash
npm install            # first time only
bin/dev                # starts docker services, runs migrations, launches dev server
                       # ctrl+c stops everything and cleans up containers
```

## Testing

```bash
bin/test               # unit/integration tests
bin/test --watch       # watch mode
bin/test --e2e         # Playwright e2e tests
bin/test path/to/file  # specific file
```

## Quality Checks

```bash
bin/lint               # typecheck + lint
bin/check              # full CI gate (typecheck + lint + tests)
```

## Deployment

Deploys to **Azure Container Apps** via GitHub Actions on push to `main`.

```bash
bin/infra dev          # provision Azure infrastructure (first time)
bin/infra prod         # provision prod infrastructure
bin/deploy dev         # build, push, and deploy app to dev
bin/deploy prod        # build, push, and deploy app to prod
```

Required environment variables (set in `.env`):

| Variable | Environments | Notes |
|----------|-------------|-------|
| `POSTGRES_ADMIN_PASSWORD` | dev, prod | |
| `NEXTAUTH_SECRET` | dev, prod | |
| `CUSTOM_DOMAIN_DEV` | dev (optional) | Custom domain for dev environment |
| `CUSTOM_DOMAIN_PROD` | prod (required) | Custom domain for prod environment |
| `AUTH_GOOGLE_ID` | prod | |
| `AUTH_GOOGLE_SECRET` | prod | |

See [`docs/tech.md`](docs/tech.md) for the full architecture and [`infra/README.md`](infra/README.md) for infrastructure details.
