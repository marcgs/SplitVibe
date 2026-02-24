---
name: validate-pr
description: >
  Validates a PR's acceptance criteria from the user's perspective using
  browser-based E2E tests (Playwright MCP) and API calls. Reads the linked
  GitHub issue as the single source of truth for acceptance criteria.
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

> **🌐 Browser-first rule:** Always prefer Browser (E2E) validation.
> If a criterion has any user-visible aspect — pages, forms, lists,
> feedback messages, navigation — it **MUST** be validated through
> the browser. API validation is a complement for verifying response
> shapes, status codes, or auth guards — never a substitute for
> browser testing of UI-facing criteria.

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
   - If it still fails after retries, mark all criteria as
     ⏭️ **Blocked** and skip to step 6 (report).

Only proceed to validation once the dev server is reachable.

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
| 1 | <text> | 🌐 Browser | ✅ PASS | Screenshot: <ref> |
| 2 | <text> | 🌐 Browser + 🔌 API | ❌ FAIL | Expected 201, got 500 |
| 3 | <text> | 🔌 API | ✅ PASS | Correct shape + 200 |
| 4 | <text> | 🌐 Browser | ⏭️ BLOCKED | Dev server unreachable |

### Summary

- ✅ **Passed:** X
- ❌ **Failed:** Y
- ⏭️ **Blocked:** Z (prerequisites not met)
```

**Final conclusion — use exactly one of:**

- ✅ **All acceptance criteria for this PR are verified.**
- ❌ **Some acceptance criteria failed validation. See details above.**

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
