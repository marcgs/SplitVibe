# ADR 002 — Agentic CI/CD Workflow

**Status:** Accepted
**Date:** 2026-03-01

---

## Context

SplitVibe uses GitHub Copilot coding agent with two custom agents:

- **implement** — Takes a GitHub issue, follows TDD to implement it, opens a PR, and runs a self-validation loop using the validate-pr agent.
- **validate-pr** — Validates a PR's acceptance criteria from the user's perspective using browser-based E2E tests (Playwright MCP) and API calls against a live dev environment.

Currently there is no CI automation. The only validation happens inside the implement agent's own loop (step 9), meaning the implementor grades its own homework. There is no independent verification, no deterministic quality gate, and no automated feedback loop when new commits are pushed to a PR.

We need a workflow that:

- Catches regressions cheaply and fast (type errors, lint violations, broken tests).
- Independently validates acceptance criteria from the user's perspective, separate from the implementor.
- Creates a natural feedback loop so Copilot can iterate on failures without human intervention.
- Keeps the human in the loop for the final merge decision.

---

## Decision

**Adopt a three-layer CI/CD workflow: deterministic CI → agentic validation → feedback loop.**

### Layer 1 — Implementation (Copilot Coding Agent)

Triggered by assigning a GitHub issue to Copilot (or invoking the implement agent manually).

1. The **implement** agent reads the issue, creates a feature branch, implements via TDD, runs its own validation loop, and opens a PR with `Closes #N`.
2. This layer is unchanged — the implement agent already handles self-validation internally.

### Layer 2 — Deterministic CI (GitHub Actions)

A GitHub Actions workflow (`.github/workflows/ci.yml`) triggers on every PR event (`opened`, `synchronize`, `reopened`).

It runs fast, deterministic checks in order:

1. **typecheck** — `npm run typecheck`
2. **lint** — `npm run lint`
3. **test** — `npm test` (Vitest unit/integration)
4. **build** — `npm run build` (production build smoke-check)

These checks require only Node.js and a Postgres service container — no browser, no agentic compute, no secrets. They catch regressions cheaply before invoking the more expensive agentic layer.

### Layer 3 — Independent Agentic Validation (Copilot CLI in Actions)

A **separate** GitHub Actions workflow (`.github/workflows/validate.yml`) triggers via `workflow_run` after the CI workflow completes successfully:

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
```

The workflow installs **GitHub Copilot CLI** (`@github/copilot`) on the runner and invokes it in **programmatic mode** (`copilot -p`) to run the **validate-pr** agent directly:

```bash
copilot -p "Run the validate-pr agent against PR #$PR_NUMBER in the
marcgs/SplitVibe repository. Post the validation report as a comment
on the PR."
```

This uses the [Copilot CLI Actions integration](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-with-actions) — the CLI runs on the Actions runner, authenticated via a fine-grained PAT stored as `COPILOT_PAT` repository secret (requires the **Copilot Requests** permission).

Key behaviors:

- **Gate on CI**: The validation workflow uses `workflow_run` to trigger only after the CI workflow completes successfully. Copilot CLI is never invoked if `tsc`, lint, or tests fail.
- **Separate workflows**: CI (`.github/workflows/ci.yml`) and validation (`.github/workflows/validate.yml`) are independent workflows with separate permissions, concurrency groups, and secrets scoping. CI needs no secrets; only the validation workflow accesses `COPILOT_PAT`.
- **Loop guard**: Before invoking the CLI, the job counts existing "Validation Report" comments on the PR. If the count reaches a configurable maximum (default: 3), it posts a "manual review needed" comment instead, preventing infinite loops.
- **Direct invocation**: Unlike a `@copilot` comment trigger, the CLI call is deterministic — it runs immediately as part of the workflow, with no dependency on Copilot monitoring PR comments.
- **Idempotency**: The validate-pr agent updates an existing validation comment rather than creating duplicates (already defined in the agent's step 8).

### Feedback Loop

When the validate-pr agent finds failures:

1. It posts a validation report on the PR with specific failure details and an `@copilot` mention requesting fixes.
2. The Copilot coding agent picks up the mention, fixes the code, and pushes new commits.
3. The new commits trigger the CI workflow again (Layer 2), and on success the validation workflow re-triggers (Layer 3), closing the loop.

The loop terminates when:

- All acceptance criteria pass (✅), or
- The maximum iteration count is reached (the workflow posts a "manual review needed" comment), or
- A human intervenes (closes the PR, pushes their own fix, or comments with instructions).

### Flow Diagram

```
  Issue assigned to Copilot
         │
         ▼
  ┌─────────────────────┐
  │  implement agent     │
  │  (TDD + self-check)  │
  └──────────┬──────────┘
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
        ▼         ▼ workflow_run
    Status     ┌──────────────────────┐
    check      │  validate.yml         │
    fails PR   │  (Layer 3)            │
               │  copilot -p           │
               │  → validate-pr agent  │
               └────────┬─────────────┘
                        │
                   ┌────┴────┐
                   │         │
                ❌ Fail    ✅ Pass
                   │         │
                   ▼         ▼
              @copilot     Ready for
              fix request  human review
                   │
                   ▼
              Copilot pushes
              new commits
                   │
                   ▼
              CI re-triggers
              (back to ci.yml)
```

---

## Alternatives Considered

### Single workflow with CI and validation as jobs

- Both deterministic CI and agentic validation could live in the same workflow file, with `needs:` linking the validation job to the CI job.
- This is simpler to set up but means both jobs share the same permissions scope and secrets access. CI doesn't need `COPILOT_PAT`, so exposing it to the entire workflow violates least-privilege. It also prevents re-running validation independently without re-running CI.
- Rejected in favor of separate workflows connected via `workflow_run`, which provides independent permissions, concurrency groups, and re-run isolation.

### Trigger via PR comment (`@copilot` mention)

- Instead of invoking Copilot CLI directly, the workflow could post a `@copilot` comment on the PR to trigger the coding agent.
- This avoids the PAT requirement (uses the built-in `GITHUB_TOKEN` to post a comment) but introduces non-determinism — the trigger depends on Copilot monitoring PR comments, which adds latency and may not always invoke the correct agent.
- Rejected in favor of direct CLI invocation, which is immediate, deterministic, and provides structured exit codes for workflow control.

### Run validate-pr entirely inside GitHub Actions runner

- The validate-pr agent requires Docker services (Postgres, Azurite), a running Next.js dev server, and Playwright MCP browser tools.
- Running all of this as a traditional GitHub Actions job (without Copilot) is possible but complex — it requires self-hosted runners with browser support, duplicates test logic already encoded in the agent, and does not benefit from AI-powered exploratory validation.
- Rejected because Copilot CLI on the runner gets the best of both worlds: the runner provides compute and the CLI provides agentic reasoning.

### Run validate-pr in parallel with CI (not gated)

- Running agentic validation simultaneously with deterministic checks would catch acceptance criteria failures faster.
- Rejected because agentic compute is significantly more expensive than CI checks. If typecheck or tests fail, the agentic run is wasted — the code needs fixing regardless.
- The sequential approach (CI first, then agentic) optimizes for cost without meaningful delay since CI runs in under 5 minutes.

### Manual trigger only (label or slash command)

- Using a `validate` label or `/validate` slash command to trigger validation on demand.
- This is simpler but defeats the goal of full automation. It would be a good fallback for re-validation but should not be the primary trigger.
- We may add manual trigger support later as a complement, not a replacement.

### Single-agent approach (implement agent does everything)

- The implement agent already validates its own work. We could rely solely on this.
- Rejected because self-validation has a blind spot: the implementor may misinterpret acceptance criteria the same way in both implementation and validation. An independent validation pass catches these systematic errors.

---

## Consequences

### Positive

- **Independent verification** — the validate-pr agent checks acceptance criteria separately from the implementor, catching systematic misinterpretations.
- **Fast feedback** — deterministic CI catches type errors, lint issues, and test failures in minutes, before expensive agentic validation runs.
- **Automated iteration** — the Copilot feedback loop (fail → fix → re-validate) reduces human toil for routine fixes.
- **Deterministic trigger** — Copilot CLI invocation is immediate and reliable, unlike comment-based triggers that depend on event polling.
- **Minimal permissions** — the CI workflow needs no secrets or special tokens; the `COPILOT_PAT` is isolated to the validation workflow.
- **Independent re-runs** — separate workflows allow re-running validation without re-running CI, and vice versa.
- **Visible audit trail** — validation reports are posted as PR comments, giving reviewers full visibility into what was checked and how.
- **Cost efficient** — agentic validation only runs after cheap deterministic checks pass.

### Negative

- **Latency** — the sequential pipeline (CI → agentic validation) adds wall-clock time compared to parallel execution. Acceptable given the cost savings.
- **PAT requirement** — Copilot CLI authentication requires a fine-grained personal access token stored as a repository secret (`COPILOT_PAT`). This token must be maintained and rotated.
- **Copilot dependency** — Layer 3 relies on Copilot CLI being available and functional on the Actions runner. If authentication fails or the CLI is unavailable, validation is skipped (CI still runs independently).

### Risks

- **Infinite loop** — if validation keeps failing and Copilot keeps pushing broken fixes, the loop could run indefinitely. Mitigated by the configurable iteration cap (default: 3).
- **Cost at scale** — each agentic validation run consumes Copilot compute. For high-volume PRs, costs could grow. Mitigated by gating on CI and the iteration cap.
- **Token expiry** — the PAT used for Copilot CLI authentication may expire. Mitigated by monitoring workflow failures and using long-lived tokens with minimal scopes.
