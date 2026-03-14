# SplitVibe — Claude Code Guide

## Repository

https://github.com/marcgs/SplitVibe

---

## Project Overview

SplitVibe is a shared-expense tracking Progressive Web App (PWA). Users create groups, add expenses (with flexible split modes), and settle up balances. It supports multi-currency expenses with FX rate capture at creation time and Azure Blob Storage for receipt attachments.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma + PostgreSQL · Azure Blob Storage · Vitest · Playwright

---

## TDD Workflow

**Always write failing tests first.**

1. Write a failing test that describes the desired behavior
2. Implement the minimal code to make it pass
3. Refactor while keeping tests green
4. Never skip tests — all features must have coverage

---

## Commands — `bin/sv`

Use `bin/sv` as the primary interface for all project commands.

```bash
bin/sv dev                            # Start dev environment (docker + db + Next.js)
bin/sv env-up                         # Start backend services (docker + db + migrations)
bin/sv env-down                       # Tear down backend services and kill port 3000
bin/sv serve                          # Start Next.js dev server only
bin/sv test [args]                    # Run tests (--e2e, --watch, path)
bin/sv test path/to/test.ts           # Run a single test file
bin/sv check                          # Full quality gate (typecheck -> lint -> test)
bin/sv lint                           # Typecheck + lint (project-wide)
bin/sv lint path/to/file.ts           # Typecheck + lint single file
bin/sv deploy <dev|prod>              # Build, push, deploy
bin/sv infra <dev|prod>               # Provision Azure infrastructure
bin/sv domain <dev|prod>              # Bind custom domain + TLS
bin/sv docs                           # List available doc topics
bin/sv docs <topic>                   # Print doc content to stdout
/e2e                                  # Claude-driven Playwright feature validation
```

> **Auto-hook:** After every `Edit` or `Write` on a `.ts`/`.tsx` file, the PostToolUse hook in `.claude/hooks/lint-typecheck.sh` automatically runs `bin/sv lint <file>`. Lint/typecheck errors will surface immediately after edits.

---

## File Structure

```
SplitVibe/
├── app/                   # Next.js App Router pages & layouts
│   ├── (auth)/            # Auth routes (login, register)
│   ├── (app)/             # Authenticated app routes
│   │   ├── groups/        # Group management
│   │   ├── expenses/      # Expense CRUD
│   │   └── settlements/   # Settlement flows
│   ├── api/               # Route handlers
│   └── globals.css
├── components/            # Shared React components (shadcn/ui + custom)
├── lib/                   # Shared utilities
│   ├── auth.ts            # Auth.js configuration
│   ├── db.ts              # Prisma client singleton
│   ├── storage.ts         # Azure Blob Storage client
│   └── fx.ts              # FX rate utilities
├── prisma/
│   └── schema.prisma      # Database schema
├── tests/
│   ├── setup.ts           # Vitest global setup
│   └── e2e/               # Playwright e2e tests
├── .claude/
│   ├── settings.json      # PostToolUse hooks
│   ├── hooks/             # Shell hook scripts
│   └── skills/            # Custom slash commands (skills)
├── docs/
│   ├── spec.md            # Full product requirements & domain rules
│   └── tech.md            # Architecture, auth flow, deployment, env vars
├── docker-compose.yml
├── Dockerfile
├── vitest.config.ts
└── playwright.config.ts
```

**Path alias:** `@` maps to the project root (e.g., `import { db } from "@/lib/db"`).

---

## Environment Variables

Copy `.env.example` to `.env` for local development without Docker. Docker Compose injects these automatically.

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
| `AZURE_STORAGE_CONNECTION_STRING` | Full connection string (Azurite in dev) |

Local Azurite credentials are hardcoded in `docker-compose.yml` (standard emulator defaults).

---

## Coding Conventions

- Use TypeScript strict mode — no `any` types
- Prefer server components; use `"use client"` only when needed
- Follow existing patterns in the codebase for consistency
- Run `bin/sv check` before considering work done

---

## Harness-first rule

**Always use `bin/sv` instead of raw `npm`, `npx`, or `docker compose` commands.** The CLI harness is the canonical interface for development, testing, linting, and deployment. If you encounter a workflow that `bin/sv` doesn't cover, suggest extending it with a new subcommand rather than inlining ad-hoc commands.
