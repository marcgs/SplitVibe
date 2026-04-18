# SplitVibe

Shared expense tracking for friends and family. Create groups, add expenses with flexible split modes, track balances, and settle up — with multi-currency support and receipt attachments.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma · PostgreSQL · Azure Blob Storage

---

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 20+

## Dev Container (recommended)

Open in VS Code and select **Reopen in Container**, or from the terminal:

```bash
devcontainer up --workspace-folder .

# Claude Code
devcontainer exec --workspace-folder . claude

# GitHub Copilot
devcontainer exec --workspace-folder . gh copilot
```

The container includes Node.js 20, Docker, GitHub CLI, Azure CLI, and Playwright. Services (PostgreSQL, Azurite) start automatically. All `bin/sv` commands work inside the container.

## Local Development

All engineering workflows go through the `bin/sv` CLI. Run `bin/sv --help` to list every command.

```bash
npm install            # first time only
bin/sv up              # start backend services (docker + db + migrations)
bin/sv serve           # start Next.js dev server
bin/sv down            # tear down backend services and kill port 3000
```

## Testing

```bash
bin/sv test                   # unit/integration tests
bin/sv test --watch           # watch mode
bin/sv test --e2e             # Playwright e2e tests
bin/sv test path/to/file      # specific file
```

## Quality Checks

```bash
bin/sv lint                   # typecheck + lint (project-wide)
bin/sv lint path/to/file.ts   # typecheck + lint a single file
bin/sv check                  # full CI gate (typecheck + lint + tests)
```

## Documentation

```bash
bin/sv docs                   # list available doc topics
bin/sv docs <topic>           # print doc content to stdout
```

## Deployment

Deploys to **Azure Container Apps** via GitHub Actions on push to `main`.

```bash
bin/sv infra dev       # provision Azure infrastructure (first time)
bin/sv infra prod      # provision prod infrastructure
bin/sv deploy dev      # build, push, and deploy app to dev
bin/sv deploy prod     # build, push, and deploy app to prod
bin/sv domain dev      # bind custom domain + TLS (dev|prod)
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

For custom domain and TLS setup, see [`infra/README.md`](infra/README.md).

---

See [`docs/tech.md`](docs/tech.md) for the full architecture and [`infra/README.md`](infra/README.md) for infrastructure details.
