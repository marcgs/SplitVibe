# SplitVibe — Copilot Instructions

## Repository

https://github.com/marcgs/SplitVibe

---

## Project Overview

Shared-expense tracking PWA. Users create groups, add expenses (with flexible split modes), and settle balances. Supports multi-currency with FX rate capture and Azure Blob Storage for receipts.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma + PostgreSQL · Azure Blob Storage · Vitest · Playwright

---

## Key References

- `docs/spec.md` — Product requirements and domain rules
- `docs/tech.md` — Architecture, auth flow, deployment, env vars
- `docs/backlog.md` — Story dependencies and context
- `docs/adr/` — Architecture Decision Records
- `prisma/schema.prisma` — Database schema
- `.env.example` — Environment variables (copy to `.env` for local dev)

---

## TDD Workflow

**Always write failing tests first.**

1. Write a failing test that describes the desired behavior
2. Implement the minimal code to make it pass
3. Refactor while keeping tests green
4. Never skip tests — all features must have coverage

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

## Coding Conventions

- Use TypeScript strict mode — no `any` types
- Prefer server components; use `"use client"` only when needed
- Follow existing patterns in the codebase for consistency
- Run `bin/sv check` before considering work done

See `.github/instructions/` for file-scoped conventions (API routes, React, TypeScript, tests, Prisma).
