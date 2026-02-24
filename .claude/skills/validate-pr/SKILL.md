---
name: validate-pr
description: >
  Validates a PR's acceptance criteria using the most appropriate strategy:
  browser-based E2E tests (Playwright MCP), API calls, CLI/terminal commands,
  or unit test execution. Reads the linked GitHub issue as the single source
  of truth for acceptance criteria.
---

# Validate PR Acceptance Criteria

Validate the acceptance criteria of the given PR.

## Input

A pull request number or URL from the **marcgs/SplitVibe** repository.

## Steps

### 1. Resolve the PR and linked GitHub issue

- Fetch the PR description from **GitHub**.
- Look for a `Closes #N`, `Fixes #N`, or `Resolves #N` reference in the PR
  body or in the linked issues sidebar.
- Open that **GitHub Issue** and extract the **Acceptance Criteria** checklist
  items verbatim.
- **GitHub is the single source of truth** — do not fall back to local
  markdown files.
- If no linked issue or acceptance criteria can be found, report an error and
  stop.

### 2. Classify each acceptance criterion

For every acceptance criterion, assign **one or more** validation
strategies. A single criterion can (and often should) be validated
through multiple complementary strategies.

Available strategies:

- **🌐 Browser (E2E)** — Criterion has **any** observable UI impact:
  pages, forms, navigation, lists, toasts, modals, visual feedback.
  Validate with Playwright MCP browser tools against
  `http://localhost:3000`.
- **🔌 API** — Criterion involves HTTP endpoints (status codes,
  response shapes, auth guards). Validate with `curl`/`fetch`
  against `http://localhost:3000/api/…`.
- **🧪 Unit / Integration test** — Criterion involves logic, schema,
  data transformations, or domain rules. Run `npx vitest run <path>`
  or `npm test`. Note gaps if no tests exist.
- **🛠️ CLI / Infrastructure** — Criterion involves DB state,
  migrations, Prisma schema, env config, Docker, or files. Run the
  appropriate CLI command and inspect output.
- **📄 Code review** — Criterion involves code quality, patterns, or
  architectural constraints. Inspect the PR diff and run
  `npm run typecheck` and `npm run lint`.

> **🌐 Browser-first rule:** If a criterion mentions user-visible
> behavior — submitting a form, seeing a list, viewing data on a page,
> receiving feedback, navigating between views — it **MUST** include
> 🌐 Browser (E2E) as a strategy, even if unit tests also cover the
> underlying logic. Unit or integration tests alone are **never** a
> substitute for browser validation of UI-facing criteria.
> Passing unit tests does not verify that the UI renders correctly,
> handles user interaction, or integrates end-to-end.

### 3. Start a clean dev environment

Always start from a **clean slate** to avoid stale state, old code, or
leftover data from previous runs.

1. **Tear down anything already running:**
   - Kill any process on port 3000
     (`lsof -ti:3000 | xargs kill 2>/dev/null`).
   - `docker compose down -v` — stop and remove all containers and
     volumes.
2. **Start backend services:**
   - `docker compose up -d db storage` — start Postgres and Azurite.
   - Wait for Postgres to be ready
     (`docker compose exec db pg_isready -U postgres`; retry if needed).
3. **Apply migrations:**
   - `npx prisma migrate dev` — apply pending migrations to a fresh DB.
4. **Start the Next.js dev server** (async/detached so it keeps running):
   - `npm run dev`
5. **Wait for the server to be ready:**
   - Poll `curl -sf http://localhost:3000` with retries (up to ~30 s).
   - If it still fails after retries, mark browser/API criteria as
     ⏭️ **Blocked** and continue with other strategies.

**Additional prerequisites:**

- **For 🧪 Unit/Integration criteria:** verify `node_modules` exists
  (run `npm ls vitest` to confirm).
- **For 🛠️ CLI/Infrastructure criteria:** the Docker services started
  above cover database access.

Only stop for the strategies that are blocked — continue validating criteria
that have their prerequisites met.

### 4. Validate each criterion

Execute each criterion using its assigned strategy:

#### 🌐 Browser (E2E)

1. Navigate to the relevant page or flow.
2. Wait for the page to be fully loaded (key selector visible / network idle).
3. Interact as a real user — fill forms, click buttons, follow redirects.
4. Assert expected outcomes: elements appear/disappear, messages shown, URL
   changes, no JS console errors.
5. Capture a screenshot via `browser_take_screenshot` after each key assertion.

#### 🔌 API

1. Construct the request (method, path, headers, body).
2. Execute via terminal: `curl -s -w "\n%{http_code}" -X METHOD URL`.
3. Assert: status code, response body shape, error messages, headers.
4. For authenticated endpoints, include the session token/cookie if available.

#### 🧪 Unit / Integration test

1. Identify the test file(s) covering the criterion.
2. Run: `npx vitest run <path/to/test.ts>`.
3. Assert: all relevant tests pass with zero failures.
4. If no tests exist for the criterion, report as
   ⚠️ **GAP — no test coverage found**.

#### 🛠️ CLI / Infrastructure

1. Run the relevant command in the terminal.
2. Assert: expected output, exit code 0, files exist, schema is valid, etc.
3. Capture terminal output as evidence.

#### 📄 Code review

1. Inspect the PR diff for the relevant files.
2. Run `npm run typecheck` and `npm run lint`.
3. Assert: no errors, patterns match the criterion requirements.

### 5. On failure

- Record the failing assertion, evidence (screenshot or terminal output), and
  context (URL, command, test name).
- **Continue** with remaining criteria — do not abort the entire run.

### 6. Report results

```markdown
## Validation Report — PR #<number>

### Issue: <issue title> (#<issue number>)

| # | Criterion | Strategy | Result | Notes |
|---|-----------|----------|--------|-------|
| 1 | <text> | 🌐 Browser + 🧪 Unit | ✅ PASS | Screenshot: <ref>, 3/3 tests pass |
| 2 | <text> | 🔌 API | ❌ FAIL | Expected 201, got 500 |
| 3 | <text> | 🧪 Unit test | ✅ PASS | 5/5 passed |
| 4 | <text> | 🛠️ CLI | ✅ PASS | Exit code 0 |
| 5 | <text> | 📄 Review | ✅ PASS | Typecheck clean |
| 6 | <text> | 🌐 Browser + 🧪 Unit | ⏭️ BLOCKED | Browser: dev server down; Unit: 2/2 pass |

### Summary

- ✅ **Passed:** X
- ❌ **Failed:** Y
- ⚠️ **Gaps:** Z (no test coverage)
- ⏭️ **Blocked:** W (prerequisites not met)
```

**Final conclusion — use exactly one of:**

- ✅ **All acceptance criteria for this PR are verified.**
- ❌ **Some acceptance criteria failed validation. See details above.**
- ⚠️ **All criteria passed but some have no test coverage.
  Consider adding tests.**

### 7. Post results to the PR

After producing the validation report, **post it as a comment on the
PR in GitHub**. Use the GitHub API (or the available GitHub MCP tools)
to add an issue comment on the pull request with the full report from
step 6.

- If a previous validation comment from this agent already exists on
  the PR, **update it** instead of creating a duplicate.
- The comment should contain the complete report table, summary, and
  conclusion so that reviewers can see the validation status directly
  in the PR timeline without re-running the agent.

### 8. Tear down the dev environment

After posting results, **always** clean up:

1. Stop the Next.js dev server (kill the process on port 3000).
2. `docker compose down -v` — stop and remove all containers and volumes.
