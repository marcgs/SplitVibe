# SplitVibe — Backlog

Items 1–8 form the MVP core; 9–14 are the second wave.

## Dependency graph

```plaintext
MVP
───
1 (DB schema)
└── 2a (Mock auth)
    ├── 3 (Groups)
    │   └── 4 (Expenses — equal split)
    │       └── 5 (Balances & simplification)
    │           └── 6 (Settlements)
    └── 2b (Google OAuth)  ← parallel with 3–6

7 (Azure infra — Bicep) ← independent; no functional dependencies
└── 8 (CI/CD — GitHub Actions) ← deploy.yml needs 7; ci.yml needs nothing

Second wave
───────────
4 → 9  (Percentage & shares split modes)
5 → 10 (Expense edit & delete)    ← parallel with 11
5 → 11 (Member lifecycle)         ← parallel with 10
5 → 12 (Global dashboard)
5 → 13 (Multi-currency)           ← parallel with 14
4 → 14 (Attachments)              ← parallel with 13
```

**Parallelisation opportunities:**

- **2b** can run in parallel with stories 3–6 once 2a is merged.
- **7** (Azure infra) can be picked up at any point alongside feature work.
- **8** (CI/CD) `ci.yml` can be wired up as soon as there is code; `deploy.yml` needs story 7.
- **10** and **11** both depend on 5 and are independent of each other.
- **13** and **14** are independent of each other and can run in parallel.

---

## 1. Database schema & migrations

**Dependencies:** none

### Description

Set up the full Prisma schema and run the initial database migration. This is the foundation every other story builds on — no feature work can start until the schema exists. An Architecture Decision Record (ADR) must be written to capture the database technology choice and schema design rationale.

### Implementation Details

- Write `docs/adr/001-database.md` documenting: why PostgreSQL was chosen, alternatives considered, trade-offs, and consequences.
- Define all models in `prisma/schema.prisma`: `User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Settlement`, `Attachment`, `ExchangeRate`.
- Include all relations, field types, and constraints (e.g. `deletedAt` for soft-delete, `inviteToken` on `Group`, `rate` on `Expense` for FX snapshot).
- Run `prisma migrate dev --name init` to generate and apply the migration.
- Commit both `schema.prisma` and the generated migration SQL.

### Acceptance Criteria

- [ ] `docs/adr/001-database.md` exists and covers: context, decision, alternatives considered, and consequences.
- [ ] `prisma migrate dev` completes without errors.
- [ ] Prisma Studio shows all eight tables with correct columns and foreign-key relations.
- [ ] `prisma generate` produces a typed client with no warnings.

---

## 2a. Mock authentication (local dev)

**Dependencies:** 1

### Description

Add a credentials-based mock provider to Auth.js v5 so developers can log in locally without real OAuth credentials. This unblocks all feature work from story 3 onward.

### Implementation Details

- Add `CredentialsProvider` to the Auth.js config in `lib/auth.ts`; active only when `NODE_ENV=development`.
- On sign-in, upsert a `User` row via the Prisma adapter using a hardcoded set of test personas (e.g. Alice, Bob, Carol).
- Add a simple login page at `app/(auth)/login/page.tsx` with a user selector.
- Protect all `(app)/` routes with a session check in the root layout or middleware; redirect unauthenticated requests to `/login`.

### Acceptance Criteria

- [ ] Selecting a mock user from the login form establishes a session.
- [ ] Protected app routes are accessible after login.
- [ ] A `User` row exists in the DB after the first mock login; subsequent logins reuse it.
- [ ] Visiting a protected route while unauthenticated redirects to `/login`.
- [ ] `CredentialsProvider` is absent (or disabled) when `NODE_ENV=production`.

---

## 2b. Google OAuth

**Dependencies:** 1, 2a · **Parallelisable with:** 3–6

### Description

Add real Google OAuth alongside the mock provider. First-time Google login auto-creates a `User` record; returning users reuse their existing record. The mock provider stays active in development.

### Implementation Details

- Add `GoogleProvider` to `lib/auth.ts` using `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` env vars.
- The Prisma adapter handles account linking and `User` upsert automatically.
- Mock provider remains enabled when `NODE_ENV=development`.
- Add a "Sign in with Google" button to the login page.

### Acceptance Criteria

- [ ] Clicking "Sign in with Google" completes the OAuth flow and redirects to the dashboard.
- [ ] A `User` row is created on first login; the same row is reused on subsequent logins.
- [ ] Mock login still works in development after this change.
- [ ] No Google credentials are required for local development (mock path unaffected).

---

## 3. Group management (create, view, invite link)

**Dependencies:** 2a

### Description

Authenticated users can create groups, view their group list, and invite others via a shareable link. This is the entry point for all expense tracking.

### Implementation Details

- API routes: `POST /api/groups`, `GET /api/groups`, `POST /api/groups/[id]/invite` (generate/revoke token).
- Pages: group list (dashboard placeholder), group detail shell, join-via-link handler (`/join/[token]`).
- Store `inviteToken` (UUID) on the `Group` model; revoke by regenerating.
- Any authenticated user hitting `/join/[token]` is added as a `GroupMember`.

### Acceptance Criteria

- [ ] A user can create a group with a name and optional description.
- [ ] The group appears in the creator's group list.
- [ ] A shareable invite link can be generated and copied.
- [ ] A second user joining via the link becomes a member and sees the group in their list.
- [ ] Revoking the link invalidates it; the old URL no longer grants access.

---

## 4. Expense creation & listing (equal split, single currency)

**Dependencies:** 3

### Description

Group members can add expenses and see them listed. Only equal split mode and USD are supported in this story — the simplest viable expense.

### Implementation Details

- API routes: `POST /api/groups/[id]/expenses`, `GET /api/groups/[id]/expenses`.
- Form fields: title, amount, paid-by (single payer), split-among (checkboxes), date.
- Write `ExpenseSplit` rows on creation: `amount = total / participantCount` (integer division; remainder to payer or first participant alphabetically).
- Display expense list inside the group detail page.

### Acceptance Criteria

- [ ] A group member can submit the expense form and the expense is persisted.
- [ ] A $90 expense split among 3 members creates three `ExpenseSplit` rows of $30 each.
- [ ] The expense appears in the group's expense list with title, amount, payer, and date.
- [ ] Non-members cannot create or view expenses in the group.

---

## 5. Balances & debt simplification

**Dependencies:** 4

### Description

Calculate each member's net balance within a group and apply the greedy min-cash-flow algorithm to produce a simplified settlement list. Displayed in the group view.

### Implementation Details

- Pure function `calculateBalances(expenses, settlements): Map<userId, amount>` — unit-testable with no DB dependency.
- Pure function `simplifyDebts(balances): {from, to, amount}[]` — greedy min-cash-flow algorithm.
- API route `GET /api/groups/[id]/balances` returns both raw balances and the simplified list.
- Render simplified debts in the group detail page.

### Acceptance Criteria

- [ ] Net balance for each member reflects all `ExpenseSplit` amounts paid vs. owed.
- [ ] A owes B £20, B owes C £20 → simplified list shows only "A owes C £20".
- [ ] Balances and simplified list update immediately after a new expense is added.
- [ ] Unit tests cover the balance and simplification logic independently of the DB.

---

## 6. Settlements

**Dependencies:** 5

### Description

Any member can record a settlement (who paid whom, how much). Settlements affect balances immediately. Any member can delete a settlement within 24 hours of creation.

### Implementation Details

- API routes: `POST /api/groups/[id]/settlements`, `DELETE /api/settlements/[id]`.
- `DELETE` checks `createdAt + 24h > now`; return 403 if window has passed.
- Balances endpoint already includes settlements; no schema change needed.
- Soft-delete pattern: set `deletedAt` rather than removing the row.

### Acceptance Criteria

- [ ] Recording a settlement of A → C £20 zeroes out the balance shown after story 5's example.
- [ ] Deleting a settlement within 24 h removes it and restores the previous balance.
- [ ] Attempting to delete a settlement older than 24 h returns an error.
- [ ] Deleted settlements are hidden in the UI but the row remains in the DB with `deletedAt` set.

---

## 7. Azure infrastructure (Bicep)

**Dependencies:** none · **Parallelisable with:** 1–6

### Description

Provision all Azure resources needed to run SplitVibe in production using Bicep IaC. Every resource is declared in code, reproducible, and version-controlled. No manual portal clicks.

### Implementation Details

- Create an `infra/` directory at the repo root with modular Bicep files:
  - `main.bicep` — orchestrates all modules; accepts `environment` parameter (`dev` / `prod`).
  - `modules/containerRegistry.bicep` — Azure Container Registry (Basic SKU for dev, Standard for prod).
  - `modules/containerApps.bicep` — Container Apps Environment + the `splitvibe` Container App; configures environment variables via Key Vault references.
  - `modules/postgres.bicep` — Azure Database for PostgreSQL Flexible Server (Burstable B1ms); VNet-integrated so only the Container App can reach it.
  - `modules/storage.bicep` — Blob Storage account + `attachments` container with private access.
  - `modules/keyVault.bicep` — Key Vault to hold `DATABASE_URL`, `NEXTAUTH_SECRET`, and storage credentials.
- Create `infra/parameters/dev.bicepparam` and `infra/parameters/prod.bicepparam` for environment-specific values (SKUs, replica counts, region).
- Assign a system-assigned Managed Identity to the Container App; grant it:
  - `AcrPull` on the Container Registry.
  - `Storage Blob Data Contributor` on the Blob Storage account.
  - `Key Vault Secrets User` on the Key Vault.
- Document the one-time bootstrap command in `infra/README.md`:
  ```bash
  az deployment sub create \
    --location westeurope \
    --template-file infra/main.bicep \
    --parameters infra/parameters/prod.bicepparam
  ```

### Acceptance Criteria

- [ ] Running the bootstrap command against an empty subscription creates all resources with no errors.
- [ ] The Container App starts with the placeholder image (`mcr.microsoft.com/azuredocs/containerapps-helloworld`) and returns HTTP 200.
- [ ] PostgreSQL is reachable from the Container App but not from the public internet.
- [ ] The Blob Storage container exists and is accessible only via the Managed Identity (no public access).
- [ ] Re-running the deployment is idempotent (no duplicate resources, no errors).
- [ ] `infra/parameters/prod.bicepparam` contains no secrets (secrets are injected via Key Vault or CI secrets).

---

## 8. CI/CD (GitHub Actions)

**Dependencies:** 7

### Description

Automate quality gates on every PR and deployments to Azure on merge to `main`. `ci.yml` has no functional dependencies and can be wired up early; `deploy.yml` requires the Azure resources from story 7.

### Implementation Details

- `.github/workflows/ci.yml`: triggers on pull_request; runs `tsc --noEmit`, `eslint`, `vitest run`, `next build`.
- `.github/workflows/deploy.yml`: triggers on push to `main`; builds Docker image, pushes to ACR, deploys new revision to Container Apps, runs `prisma migrate deploy` against the production DB.
- Store Azure credentials and ACR details as GitHub Actions secrets.
- Use `prisma migrate deploy` (not `dev`) in the deploy workflow.

### Acceptance Criteria

- [ ] Opening a PR with a TypeScript or lint error causes CI to fail.
- [ ] Opening a PR with all checks passing causes CI to succeed.
- [ ] Merging a clean PR to `main` triggers the deploy workflow.
- [ ] After a successful deploy, the new revision is visible in Azure Container Apps.
- [ ] Prisma migrations are applied to the production database as part of the deploy.

---

## 9. Percentage & shares split modes

**Dependencies:** 4

### Description

Extend the expense form with two additional split modes: percentage (must sum to 100%) and weighted shares. Covers the full split-mode spec.

### Implementation Details

- Add a split-mode selector to the expense form: Equal / Percentage / Shares.
- Percentage mode: validate that inputs sum to exactly 100% before submission.
- Shares mode: compute each participant's amount as `(weight / totalWeight) * total`.
- Apply the rounding rule from the spec: remainder goes to the payer if they are a split participant, otherwise to the first participant alphabetically.
- Reuse the same `ExpenseSplit` table; store the computed monetary amount (not the raw weight/percentage).

### Acceptance Criteria

- [ ] $90 split as Alice 50%, Bob 30%, Carol 20% → `ExpenseSplit` rows of $45, $27, $18.
- [ ] Submitting percentages that do not sum to 100% is rejected with a validation error.
- [ ] $90 split with weights 2/1/1 → rows of $45, $22.50, $22.50.
- [ ] Rounding remainder is assigned correctly per the spec rule.

---

## 10. Expense edit & delete (soft-delete)

**Dependencies:** 5 · **Parallelisable with:** 11

### Description

The expense creator can edit any field of their expense or soft-delete it. Balances recalculate automatically.

### Implementation Details

- API routes: `PATCH /api/expenses/[id]`, `DELETE /api/expenses/[id]`.
- `PATCH` replaces `ExpenseSplit` rows atomically (delete old, insert new in a transaction).
- `DELETE` sets `deletedAt` on the `Expense`; soft-deleted expenses are excluded from balance queries.
- Enforce creator-only access (return 403 for other members).

### Acceptance Criteria

- [ ] Editing a $90 expense to $60 updates balances accordingly.
- [ ] Only the expense creator can edit or delete the expense; other members receive a 403.
- [ ] A deleted expense is hidden from the expense list in the UI.
- [ ] The `Expense` row still exists in the DB with `deletedAt` populated after deletion.

---

## 11. Member lifecycle (leave, remove, archive)

**Dependencies:** 5 · **Parallelisable with:** 10

### Description

Members can leave or be removed when their balance is zero. A group can be archived (read-only) when all balances are zero.

### Implementation Details

- API routes: `DELETE /api/groups/[id]/members/[userId]` (leave or remove), `POST /api/groups/[id]/archive`.
- Guard: reject leave/remove if target member's balance ≠ 0.
- Guard: reject archive if any member's balance ≠ 0.
- Archived groups: set `archivedAt` on `Group`; middleware/route handlers return 403 for any mutating operation on an archived group.

### Acceptance Criteria

- [ ] Attempting to leave with a non-zero balance returns an error.
- [ ] A member with a zero balance can leave; they no longer see the group.
- [ ] Any member can remove another member whose balance is zero; the removed member loses access.
- [ ] Attempting to archive a group with active balances returns an error.
- [ ] An archived group rejects new expenses, settlements, and member changes.

---

## 12. Global dashboard

**Dependencies:** 5

### Description

Show the user's total balance across all groups, a per-group breakdown, and the full list of pending suggested settlements.

### Implementation Details

- API route `GET /api/dashboard` aggregates balances across all groups the user belongs to.
- Display currency is fixed (USD) for now — multi-currency conversion is added in story 13.
- Pending settlements are the union of each group's simplified debt list where the current user is a participant.
- Page at `app/(app)/dashboard/page.tsx`; link to each group from the breakdown.

### Acceptance Criteria

- [ ] A user in two groups sees the correct aggregate balance (sum of per-group net balances).
- [ ] Each group's balance is shown with a link to the group detail page.
- [ ] Pending suggested settlements from all groups are listed.
- [ ] A user in no groups sees a zero balance and an empty state.

---

## 13. Multi-currency (FX rates + Frankfurter)

**Dependencies:** 5 · **Parallelisable with:** 14

### Description

Add currency selection to expenses. Fetch and cache daily rates from the Frankfurter API. Snapshot the rate on the expense at creation time and convert dashboard balances to the user's preferred display currency.

### Implementation Details

- Extend expense form with a currency selector (ISO 4217).
- Background route or cron (`app/api/fx/refresh/route.ts`) fetches rates from Frankfurter once per day and upserts `ExchangeRate` rows.
- On expense creation, look up the cached rate and store it on `Expense.exchangeRate` — never update it retroactively.
- Add `baseCurrency` to `Group` (changeable by any member); add `preferredCurrency` to `User`.
- Dashboard converts per-group balances using the latest cached rate.

### Acceptance Criteria

- [ ] Adding a €90 expense to a USD group stores the EUR→USD rate on the expense row at creation time.
- [ ] Changing the group's base currency later does not alter the stored rate on historical expenses.
- [ ] The global dashboard shows balances converted to the user's preferred display currency.
- [ ] If no cached rate exists for a currency pair, expense creation returns a clear error.

---

## 14. Attachments (Azure Blob / Azurite)

**Dependencies:** 4 · **Parallelisable with:** 13

### Description

Users can attach receipts or files to expenses. Uploads go directly to Blob Storage via pre-signed URLs; the app server never handles the file bytes.

### Implementation Details

- API routes: `POST /api/attachments/presign` (returns SAS upload URL), `POST /api/attachments` (saves blob reference after upload), `GET /api/attachments/[id]` (returns SAS read URL).
- Enforce limits in the presign handler: max 5 files per expense, max 10 MB, accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`.
- Read URL TTL: configurable via env var (default 15 minutes).
- Local dev uses Azurite (`AZURE_STORAGE_CONNECTION_STRING` points to the emulator).

### Acceptance Criteria

- [ ] Uploading a JPEG receipt attaches it to the expense and it is visible via a signed URL.
- [ ] The signed read URL expires after the configured TTL.
- [ ] Attempting to attach a 6th file is rejected.
- [ ] Attempting to upload a file larger than 10 MB is rejected.
- [ ] Attempting to upload a disallowed file type is rejected.
