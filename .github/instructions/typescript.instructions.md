---
applyTo: "**/*.ts"
---

# TypeScript Conventions

- Strict mode — no `any` types.
- Named exports for functions and interfaces. Default exports only for Next.js pages.
- Use Zod with `safeParse()` — never `.parse()` (never throw on validation).
- Return `parsed.error.flatten()` in validation error responses for client debugging.
- Define Zod schemas at module level, one per endpoint/use-case.
- Use `Decimal` (from Prisma) for monetary values — never floating-point.
- Prefer pure functions in `lib/` with explicit input/output types.
