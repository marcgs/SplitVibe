---
name: implement
description: >
  Implements a GitHub issue (story) end-to-end following the project's TDD
  workflow, opens a pull request, and then invokes the validate-pr skill to
  verify that all acceptance criteria are met.
---

# Implement Story

Implement a GitHub issue, open a PR, and validate it.

## Input

A GitHub issue number or URL from the **marcgs/SplitVibe** repository.

## Steps

### 1. Read and understand the issue

- Fetch the **GitHub Issue** by number from the `marcgs/SplitVibe` repository.
- Extract the following sections verbatim:
  - **Description** — what the story is about.
  - **Implementation Details** — key technical decisions, affected files,
    non-obvious notes.
  - **Acceptance Criteria** — the checklist of conditions that must be true.
- If the issue has no acceptance criteria, report an error and stop.

### 2. Study the codebase

- Read the project instructions:
  - `docs/spec.md` — product requirements and domain rules.
  - `docs/tech.md` — architecture, auth flow, deployment, env vars.
  - `docs/backlog.md` — story dependencies and context.
  - `prisma/schema.prisma` — current database schema.
- Explore the current codebase to understand existing patterns, file
  structure, and conventions (App Router layout, API route handlers,
  test structure, component patterns).
- Identify which files need to be created or modified.

### 3. Create a feature branch

- Create a new Git branch from the default branch (`main`):
  ```
  git checkout main && git pull origin main
  git checkout -b copilot/issue-<number>-<short-slug>
  ```
- The `<short-slug>` should be a kebab-case summary of the issue title
  (e.g., `copilot/issue-42-percentage-split-mode`).

### 4. Plan the implementation

Before writing any code, produce a brief implementation plan:

1. List every acceptance criterion and the files affected.
2. Identify the order of implementation — respect dependencies
   (e.g., schema changes before API routes before UI).
3. For each piece, note which test file(s) will cover it.

Share the plan for the user to review before proceeding.

### 5. Implement using TDD

**Follow the project's TDD workflow strictly:**

For each logical unit of work:

1. **Write a failing test first** that describes the desired behavior.
   - Unit/integration tests go in `tests/` using Vitest.
   - E2E tests go in `tests/e2e/` using Playwright.
2. **Run the test** to confirm it fails:
   ```bash
   npx vitest run <path/to/test.ts>
   ```
3. **Implement the minimal code** to make the test pass.
4. **Run the test again** to confirm it passes.
5. **Refactor** while keeping tests green.
6. **Repeat** for the next unit of work.

#### Implementation guidelines

- **TypeScript strict mode** — no `any` types.
- **Prefer server components**; use `"use client"` only when needed.
- **Follow existing patterns** in the codebase for consistency.
- Use the `@` path alias for imports (e.g., `import { db } from "@/lib/db"`).
- For Prisma schema changes, create and apply a migration:
  ```bash
  npx prisma migrate dev --name <descriptive-name>
  ```
- For new API routes, follow the existing route handler patterns in `app/api/`.
- For new pages, follow the existing App Router patterns in `app/(app)/`.
- For new components, follow shadcn/ui patterns in `components/`.

### 6. Quality checks

After all implementation is complete, run the full quality suite:

```bash
npm run typecheck          # Must pass with zero errors
npm run lint               # Must pass with zero errors
npm test                   # All unit/integration tests must pass
```

Fix any issues before proceeding. Do not skip this step.

### 7. Commit and push

- Stage all changes and create a well-structured commit (or multiple
  commits for logical units):
  ```bash
  git add -A
  git commit -m "feat: <short description>

  <longer description if needed>

  Closes #<issue-number>"
  ```
- Push the branch:
  ```bash
  git push -u origin copilot/issue-<number>-<short-slug>
  ```

### 8. Open a pull request

Create a pull request on GitHub with:

- **Title:** A concise summary of the change.
- **Body:** Include:
  - A brief description of what was implemented and why.
  - A link to the issue: `Closes #<issue-number>`.
  - A summary of the changes (files added/modified, key decisions).
  - Any notes for reviewers.
- **Base branch:** `main`
- **Head branch:** `copilot/issue-<number>-<short-slug>`

### 9. Validate the PR

After the PR is created, invoke the **validate-pr** skill to verify that
all acceptance criteria are met:

```
/validate-pr PR #<pr-number>
```

The validate-pr skill will **post its validation report as a comment on the
PR** (see validate-pr Step 7). Ensure the full report table, summary, and
conclusion are visible in the PR timeline so reviewers can see the
validation status without re-running the skill. If a previous validation
comment already exists, it should be updated rather than duplicated.

- If validation passes — report success to the user.
- If validation fails — inspect the failures, fix the code, push
  updated commits, and re-run validation until all criteria pass or
  the issue is clearly identified. Each re-validation must update the
  existing PR comment with the latest results.
- If validation finds test coverage gaps — add the missing tests,
  push, and re-validate.

### 10. Final report

```markdown
## Implementation Report — Issue #<number>

### Story: <issue title>

| Phase | Status | Notes |
|-------|--------|-------|
| Issue read | ✅ | <N> acceptance criteria found |
| Branch created | ✅ | `copilot/issue-<N>-<slug>` |
| Tests written | ✅ | <N> test files, <M> test cases |
| Implementation | ✅ | <N> files created, <M> modified |
| Typecheck | ✅ | Zero errors |
| Lint | ✅ | Zero errors |
| All tests pass | ✅ | <N>/<N> passing |
| PR opened | ✅ | PR #<pr-number> |
| Validation | ✅ | All criteria verified |

### PR: #<pr-number> — <pr-title>
### Validation: ✅ All acceptance criteria verified
```
