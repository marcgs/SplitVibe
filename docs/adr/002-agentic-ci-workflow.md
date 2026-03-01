# ADR 002 — Agentic CI/CD Workflow

**Status:** Accepted
**Date:** 2026-03-01

---

## Context

SplitVibe uses GitHub Copilot coding agent with two custom agents:

- **implement** — Takes a GitHub issue, follows TDD to implement it, opens a PR, and runs a self-validation loop using the validate-pr agent.
- **validate-pr** — Validates a PR's acceptance criteria from the user's perspective using browser-based E2E tests (Playwright MCP) and API calls against a live dev environment.

We need a workflow that:

- Catches regressions cheaply and fast (type errors, lint violations, broken tests).
- Provides a deterministic quality gate for every PR.
- Keeps the human in the loop for the final merge decision.

---

## Decision

**Adopt a two-layer CI/CD workflow: deterministic CI + implement-agent self-validation. Defer automated independent agentic validation (Layer 3) until the platform supports it.**

### Layer 1 — Implementation (Copilot Coding Agent)

Triggered by assigning a GitHub issue to Copilot (or invoking the implement agent manually).

1. The **implement** agent reads the issue, creates a feature branch, implements via TDD, runs its own validation loop, and opens a PR with `Closes #N`.
2. In Step 9, the implement agent invokes the **validate-pr** skill within the same coding agent session. This runs in a full VM with Docker, git, npm, and Playwright MCP — providing complete E2E acceptance-criteria validation.
3. The validation report is posted as a comment on the PR.

### Layer 2 — Deterministic CI (GitHub Actions)

A GitHub Actions workflow (`.github/workflows/ci.yml`) triggers on every PR event (`opened`, `synchronize`, `reopened`).

It runs fast, deterministic checks in order:

1. **typecheck** — `npm run typecheck`
2. **lint** — `npm run lint`
3. **test** — `npm test` (Vitest unit/integration)
4. **build** — `npm run build` (production build smoke-check)

These checks require only Node.js and a Postgres service container — no browser, no agentic compute, no secrets. They catch regressions cheaply on every push.

### Layer 3 — Independent Agentic Validation (Deferred)

Automated independent re-validation after subsequent pushes is **deferred**. See [Investigation Findings](#investigation-findings) below for the full analysis of approaches attempted and why none are viable today.

Current workarounds for re-validation:

- **Manual trigger** — a human can comment `@copilot` on the PR to request validation. The coding agent will pick up the mention but will create a sub-PR (see findings below).
- **Re-assign to implement agent** — for significant rework, re-running the implement agent triggers a fresh validation cycle (Step 9).

### Flow Diagram

```
  Issue assigned to Copilot
         │
         ▼
  ┌──────────────────────────┐
  │  implement agent          │
  │  (TDD + self-check)       │
  │  Step 9: validate-pr skill│
  │  → posts report on PR     │
  └──────────┬───────────────┘
             │ Opens PR
             ▼
  ┌─────────────────────────────────┐
  │  ci.yml (Layer 2)               │
  │  typecheck → lint → test → build │
  └──────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
     ❌ Fail    ✅ Pass
        │         │
        ▼         ▼
    Status     Ready for
    check      human review
    fails PR
```

---

## Investigation Findings

We investigated multiple approaches for automated Layer 3 validation (independent re-validation triggered after CI passes). All were found to be non-viable with current platform capabilities.

### Approach 1: Copilot CLI programmatic mode (`copilot -p`)

**Tested on:** 2026-03-01 (workflow runs #1–#2)

The workflow installed Copilot CLI on the Actions runner and invoked it in programmatic mode to run the validate-pr agent directly, authenticated via a fine-grained PAT (`COPILOT_PAT`).

**Result:** The CLI authenticated successfully and invoked the validate-pr agent. However, the CLI's programmatic mode runs with a **restricted shell sandbox** — most commands fail with "Permission denied":

| Commands that work | Commands that fail |
|---|---|
| `cat`, `ls` (home paths), `env`, `grep` | `git`, `docker`, `npm`, `curl`, `bash -c`, `python3`, file writes, `$GITHUB_STEP_SUMMARY` |

The validate-pr agent requires full shell access (Docker services, dev server, Playwright). The CLI can only perform read-only file operations and GitHub MCP API calls, which is insufficient.

**Verdict:** Not viable. CLI sandbox too restrictive for E2E validation.

### Approach 2: `@copilot` comment trigger via `GITHUB_TOKEN`

**Tested on:** 2026-03-01 (workflow runs #3–#4)

After CI passes, a `workflow_run`-triggered workflow posts an `@copilot` comment on the PR using the built-in `GITHUB_TOKEN` to invoke the coding agent (which has full VM access).

**Result:** The comment was posted by `github-actions[bot]`. The Copilot coding agent **ignored the mention** — it does not respond to bot-authored `@copilot` mentions (likely to prevent infinite loops).

**Verdict:** Not viable with `GITHUB_TOKEN`.

### Approach 3: `@copilot` comment trigger via real-user PAT

**Tested on:** 2026-03-01 (workflow runs #5–#8)

Same as Approach 2, but the comment is posted using a real-user fine-grained PAT (`COPILOT_PAT` repository secret) so the mention appears from a human account.

**Result:** The coding agent **picked up the mention** (responded within seconds). However, its hardcoded behavior when mentioned on a PR is to **always create a sub-PR** — it opened empty draft PRs (#37, #40) targeting the original PR's branch. Despite explicit instructions ("Do NOT create a new branch or open a new pull request. Only post the validation report as a comment here."), the agent:
- Created a sub-branch (e.g., `copilot/sub-pr-31-again`)
- Opened a draft sub-PR
- Did **not** invoke the validate-pr skill
- Did **not** post a validation report on the original PR

This appears to be a fundamental design constraint of the Copilot coding agent when triggered via PR comments — it always operates in "implementation mode" (create branch → make changes → open PR), not "comment-only mode."

**Verdict:** Not viable. Coding agent cannot be instructed to only post comments on a PR.

### Approach 4: Copilot Code Review agent (Rulesets)

**Evaluated but not tested.**

GitHub's Copilot Code Review agent can be configured via repository Rulesets to automatically review every PR. It posts review comments directly on the PR (no sub-PRs).

**Limitation:** The review agent performs **static code review only** — it analyzes the diff and posts line-by-line feedback. It has no shell access and cannot start Docker services, run a dev server, or execute Playwright E2E tests. It cannot perform runtime acceptance-criteria validation.

**Verdict:** Useful for code quality feedback but not a replacement for E2E validation.

### Approach 5: Run E2E validation directly in GitHub Actions

**Evaluated but not implemented.**

The workflow itself would run: `docker compose up` → `npm run dev` → Playwright tests → post results via `github-script`. No Copilot dependency.

**Tradeoffs:**
- ✅ Deterministic, reliable, no agentic compute
- ⚠️ Loses AI-powered exploratory validation (only runs pre-written tests)
- ⚠️ Requires Playwright test infrastructure in the workflow + large runners for Docker-in-Actions
- ⚠️ Duplicates test logic already encoded in the validate-pr agent

**Verdict:** Viable but deferred — would require significant infrastructure work and only runs pre-written tests (no AI reasoning).

---

## Alternatives Considered

### Single workflow with CI and validation as jobs

- Both deterministic CI and agentic validation could live in the same workflow file, with `needs:` linking the validation job to the CI job.
- Rejected: shared permissions scope violates least-privilege. Cannot re-run validation independently.

### Run validate-pr in parallel with CI (not gated)

- Running agentic validation simultaneously with deterministic checks would catch acceptance criteria failures faster.
- Rejected: agentic compute is significantly more expensive. If typecheck or tests fail, the agentic run is wasted.

### Single-agent approach (implement agent does everything)

- The implement agent already validates its own work (Step 9). We could rely solely on this.
- This is the **current approach** (by necessity). The blind spot is that the implementor may misinterpret acceptance criteria the same way in both implementation and validation. Independent re-validation would catch systematic errors but is not yet feasible to automate.

---

## Consequences

### Positive

- **Fast feedback** — deterministic CI catches type errors, lint issues, and test failures in minutes on every push.
- **No secrets required** — CI uses only `GITHUB_TOKEN`. No PAT management or rotation.
- **Simple and reliable** — no agentic dependencies, no non-deterministic timing, no sub-PR noise.
- **E2E validation at implementation time** — the implement agent's Step 9 provides full acceptance-criteria validation (Docker, Playwright, AI reasoning) during the initial implementation cycle.
- **Visible audit trail** — CI results are standard GitHub status checks. Validation reports from the implement agent are posted as PR comments.

### Negative

- **No automated re-validation** — after subsequent pushes to an open PR, there is no automated E2E re-validation. CI catches regressions in type safety, lint, and unit tests, but acceptance-criteria validation requires manual intervention.
- **Self-validation blind spot** — the implement agent validates its own work (Step 9). If it systematically misinterprets an acceptance criterion, both implementation and validation will agree on the wrong behavior.

### Risks

- **Regression after post-implementation pushes** — a human or Copilot push that breaks acceptance criteria won't be caught automatically (only CI regressions are caught). Mitigated by human review before merge.
- **Platform evolution** — GitHub may add support for coding agent "comment-only" responses or a public API to trigger agent sessions without sub-PRs. When this happens, Layer 3 should be revisited.

### Deferred Work

- **Layer 3 automation** — revisit when the Copilot coding agent supports comment-only responses (no sub-PR) or when a public API for triggering agent sessions becomes available.
- **Copilot Code Review Ruleset** — can be enabled independently as a complement for static code quality feedback. Does not require workflow changes.
- **Deterministic E2E in Actions** — if pre-written Playwright tests grow sufficient coverage, running them directly in CI (Approach 5) becomes more attractive.
