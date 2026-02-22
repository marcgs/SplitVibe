# ADR 001 — Database Technology & Schema Design

**Status:** Accepted
**Date:** 2026-02-22

---

## Context

SplitVibe is a shared-expense tracking PWA that requires persistent storage for users, groups, expenses, settlements, attachments, and exchange rates. The data is inherently relational — expenses belong to groups, splits belong to expenses, settlements reference two users, and so on. We need a database that supports:

- Strong referential integrity (foreign keys, cascading deletes).
- Decimal precision for monetary amounts.
- Transactional consistency for balance-affecting operations (expense creation, settlement recording).
- Soft-delete patterns for audit trails on expenses and settlements.
- Efficient querying for balance calculations across groups.

The deployment target is Microsoft Azure, and local development uses Docker Compose.

---

## Decision

**Use PostgreSQL as the primary database**, accessed via the Prisma ORM.

### Schema design

The schema defines the following models:

| Model | Purpose |
|-------|---------|
| **User** | Auth.js-managed user profile (social login via Google/Apple). |
| **Account** | OAuth provider account linked to a User (Auth.js adapter). |
| **Session** | Database-backed session for Auth.js (enables easy revocation). |
| **VerificationToken** | Auth.js email verification tokens. |
| **Group** | Organizing unit for expenses; has a base currency and a unique invite token. |
| **GroupMember** | Join table between User and Group with a role field (`admin` / `member`). |
| **Expense** | A recorded cost with amount, currency, FX rate snapshot, split mode, and soft-delete support. |
| **ExpensePayer** | Who paid for an expense and how much (supports multi-payer). |
| **ExpenseSplit** | How an expense is divided among participants (amount, percentage, or shares). |
| **Settlement** | A manual payment record between two users in a group, with soft-delete support. |
| **Attachment** | File metadata for receipt uploads stored in Azure Blob Storage. |
| **ExchangeRate** | Cached daily FX rates from the Frankfurter API (ECB data). |

Key design decisions within the schema:

- **Soft deletes** (`deletedAt` nullable timestamp) on `Expense` and `Settlement` to preserve audit history.
- **FX snapshot** (`fxRate`, `baseCurrencyAmount`) stored directly on `Expense` so historical conversions are never retroactively changed.
- **Invite tokens** (`inviteToken` with unique constraint) on `Group` for shareable join links.
- **Cascade deletes** on most relations (e.g., deleting a group removes its members and expenses). `Settlement` uses `RESTRICT` on payer/payee to preserve payment history.
- **Decimal precision** (`Decimal(14,4)` for amounts, `Decimal(18,6)` for FX rates) to avoid floating-point errors in financial calculations.
- **Composite unique constraints** on join tables (`GroupMember`, `ExpensePayer`, `ExpenseSplit`) to prevent duplicate associations.

---

## Alternatives Considered

### MySQL / MariaDB

- Viable alternative with good relational support.
- PostgreSQL was preferred for its richer type system (`DECIMAL` precision, native `ENUM`), superior support for complex queries (CTEs, window functions useful for balance calculations), and first-class support from Prisma and Azure (Flexible Server).

### MongoDB

- Document model does not naturally fit the highly relational expense-splitting domain.
- Lacks native foreign-key enforcement, which would push referential integrity into application code.
- Transactions across collections are possible but add complexity.

### SQLite

- Excellent for prototyping and single-user apps.
- Not suitable for a multi-user web app deployed on Azure Container Apps (no built-in managed service, concurrency limitations).

### Prisma vs. other ORMs (Drizzle, Knex, TypeORM)

- Prisma was chosen for its schema-first approach, auto-generated typed client, and built-in migration tooling.
- Drizzle was a close second but Prisma's Auth.js adapter (`@auth/prisma-adapter`) provides seamless integration with the authentication layer.

---

## Consequences

### Positive

- **Referential integrity** is enforced at the database level, reducing the risk of orphaned records.
- **Type-safe queries** via the generated Prisma client eliminate an entire class of runtime errors.
- **Migration history** is version-controlled alongside the schema, making deployments reproducible.
- **Azure Database for PostgreSQL Flexible Server** provides a managed, scalable hosting option with private VNet access.
- **Decimal types** ensure monetary calculations are precise and not subject to floating-point drift.

### Negative

- PostgreSQL requires a running server for local development (mitigated by Docker Compose with a `postgres:16-alpine` container).
- Prisma adds a build step (`prisma generate`) that must run before the application starts; CI and Docker builds must account for this.
- Schema changes require explicit migrations; ad-hoc column additions are not possible without a migration file.

### Risks

- If the schema grows significantly, Prisma's query engine may need tuning for complex balance-calculation queries. Raw SQL escape hatches (`$queryRaw`) are available if needed.
