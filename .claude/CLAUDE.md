# SplitVibe — Claude Code Guide

## Repository

https://github.com/marcgs/SplitVibe

---

## Project Overview

SplitVibe is a shared-expense tracking Progressive Web App (PWA). Users create groups, add expenses (with flexible split modes), and settle up balances. It supports multi-currency expenses with FX rate capture at creation time and Azure Blob Storage for receipt attachments.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma + PostgreSQL · Azure Blob Storage · Vitest · Playwright

---

## CLI — `bin/sv`

**Always use `bin/sv` instead of raw `npm`, `npx`, or `docker compose` commands.** If a workflow isn't covered, suggest extending the harness with a new subcommand. Run `bin/sv docs <topic>` to read project documentation.

```bash
bin/sv up                             # Start backend services (docker + db + migrations)
bin/sv down                           # Tear down backend services and kill port 3000
bin/sv serve                          # Start Next.js dev server only
bin/sv test [args]                    # Run tests (--e2e, --watch, path)
bin/sv test path/to/test.ts           # Single test file
bin/sv check                          # Full quality gate (typecheck + lint + test)
bin/sv lint                           # Typecheck + lint (project-wide)
bin/sv lint path/to/file.ts           # Typecheck + lint single file
bin/sv deploy <dev|prod>              # Build, push, deploy
bin/sv infra <dev|prod>               # Provision Azure infrastructure
bin/sv domain <dev|prod>              # Bind custom domain + TLS
bin/sv docs                           # List available doc topics
bin/sv docs <topic>                   # Print doc content to stdout
```

---

## Secret Environment Variables

**Never output the resolved values of any variable defined in `.env` or `.env.example`** in code, comments, documentation, PR descriptions, commit messages, or any other generated text. This includes database URLs, auth secrets, OAuth credentials, API keys, domain names, storage keys, and connection strings.

Always reference them by variable name only (e.g., `$CUSTOM_DOMAIN_DEV`, `process.env.DATABASE_URL`). If writing scripts or infrastructure code that uses these, use env-var references — never inline the actual values.

---

## Coding Conventions

- Use TypeScript strict mode — no `any` types
- Prefer server components; use `"use client"` only when needed
- Follow existing patterns in the codebase for consistency
- Run `bin/sv check` before considering work done
