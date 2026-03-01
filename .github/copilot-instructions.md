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

## Commands

```bash
# Dev environment
docker compose up                     # Start postgres + azurite
npm run dev                           # Next.js dev server (port 3000)
npm run db:migrate                    # Run Prisma migrations
npm run db:generate                   # Regenerate Prisma client

# Quality (run before pushing)
npm run typecheck                     # TypeScript type-check
npm run lint                          # ESLint
npm test                              # Vitest unit/integration tests
npm run build                         # Production build smoke-check

# Testing
npx vitest run path/to/test.ts        # Single test file
npx vitest run -t "test name"         # Tests matching a pattern
npm run test:e2e                      # Playwright e2e tests
```
