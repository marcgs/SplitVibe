# SplitVibe

Shared expense tracking for friends and family. Create groups, add expenses with flexible split modes, track balances, and settle up — with multi-currency support and receipt attachments.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Auth.js v5 · Prisma · PostgreSQL · Azure Blob Storage

---

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 20+

## Local Development

1. **Copy environment variables**

   ```bash
   cp .env.example .env.local
   # Fill in AUTH_* and AZURE_* values — DATABASE_URL and Azurite are pre-set
   ```

2. **Start backing services**

   ```bash
   docker compose up
   ```

   This starts PostgreSQL (port 5432) and Azurite blob storage (port 10000). Then run Next.js locally:

   ```bash
   npm install
   npm run db:migrate
   npm run dev        # http://localhost:3000
   ```

   To run everything in Docker (including the app):

   ```bash
   docker compose --profile full up
   ```

## Testing

```bash
npm test               # Vitest unit/integration tests
npm run test:e2e       # Playwright end-to-end tests
npm run typecheck      # TypeScript type-check
npm run lint           # ESLint
```

## Deployment

Deploys to **Azure Container Apps** via GitHub Actions on push to `main`. See [`docs/tech.md`](docs/tech.md) for the full architecture.
