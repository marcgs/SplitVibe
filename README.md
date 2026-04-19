# SplitVibe

Shared expense tracking for friends and family. Create groups, add expenses with flexible split modes, track balances, and settle up — with multi-currency support and receipt attachments.

**Stack:** Next.js 15 (App Router, PWA) · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma · PostgreSQL · Azure Blob Storage · Vitest · Playwright · Docker

---

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 22+

## Local Development

Copy [`.env.example`](.env.example) to `.env` and fill in the required values.

All engineering workflows go through the `bin/sv` CLI. Run `bin/sv --help` to list every command.

```bash
npm install            # first time only
bin/sv up              # start docker (Postgres + Azurite) + run Prisma migrations
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
bin/sv check-env-leak         # scan staged diff for leaked .env values
```

## Documentation

```bash
bin/sv docs                   # list available doc topics
bin/sv docs <topic>           # print doc content to stdout
```

## Deployment

Deploys target **Azure Container Apps** and are run manually from a developer
machine using the `bin/sv` CLI:

```bash
bin/sv infra [dev|prod]       # provision Azure infrastructure
bin/sv deploy [dev|prod]      # build, push, and deploy app
bin/sv domain [dev|prod]      # bind custom domain + TLS (dev|prod)
```

Deploy-time environment variables must be set in `.env`. See
[`.env.example`](.env.example) for the complete list of variables
(database URL, Azure Storage credentials, Azurite overrides, additional OAuth
providers, etc.). For custom domain and TLS setup, see
[`infra/README.md`](infra/README.md).

---

Further reading:

- [`docs/spec.md`](docs/spec.md) — product specification
- [`docs/tech.md`](docs/tech.md) — technical architecture
- [`docs/backlog.md`](docs/backlog.md) — feature backlog
- [`infra/README.md`](infra/README.md) — infrastructure and deployment details
