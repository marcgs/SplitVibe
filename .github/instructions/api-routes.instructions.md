---
applyTo: "app/api/**/*.ts"
---

# API Route Handler Conventions

Follow this order in every route handler:

1. **Auth** — `const session = await auth(); if (!session?.user?.id) return 401`.
2. **Parse JSON** — wrap `await request.json()` in try-catch, return 400 on failure.
3. **Validate** — Zod `safeParse()`, return 400 with `parsed.error.flatten()` on failure.
4. **Authorize** — check group membership / ownership, return 403 if denied.
5. **Business logic** — domain checks, return 400/404 as needed.
6. **Database** — Prisma query.
7. **Respond** — `NextResponse.json(data, { status: 200 | 201 })`.

Additional rules:
- Error shape: `{ error: "message" }` or `{ error: "message", details: ... }`.
- Dynamic route params must be awaited: `const { id } = await params;` (Next.js 15).
- Select only needed fields from Prisma: `select: { id: true, name: true }`.
- Soft deletes: filter with `where: { deletedAt: null }`.
- Money amounts are stored and compared as integer cents — use `Math.floor` for base splits, distribute remainder to first N participants alphabetically.
