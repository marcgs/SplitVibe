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

These checks require only Node.js and a Postgres service container — no browser, no agentic compute. They catch regressions cheaply before invoking the more expensive agentic layer.

### Layer 3 — Independent Agentic Validation (Copilot via PR comment)

After deterministic CI passes, the workflow posts a PR comment that triggers the Copilot coding agent to run the **validate-pr** agent independently:

```
@copilot Please validate this PR's acceptance criteria against the linked
issue using the validate-pr agent. Post the validation report as a comment
on this PR.
```

Key behaviors:

- **Gate on CI**: The agentic validation comment is only posted if all Layer 2 checks pass. There is no point burning agentic compute if `tsc` or tests fail.
- **Loop guard**: Before posting, the workflow counts existing `@copilot` validation trigger comments. If the count exceeds a configurable maximum (default: 3), it posts a summary comment instead of triggering another iteration, preventing infinite loops.
- **Idempotency**: The validate-pr agent updates an existing validation comment rather than creating duplicates (already defined in the agent's step 8).

### Feedback Loop

When the validate-pr agent finds failures:

1. It posts a validation report on the PR with specific failure details.
2. The report includes an `@copilot` mention requesting fixes for the failing criteria.
3. Copilot coding agent picks up the comment, fixes the code, and pushes new commits.
4. New commits trigger the CI workflow again (Layer 2 → Layer 3), closing the loop.

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
  │  Layer 2: GitHub Actions CI      │
  │  typecheck → lint → test → build │
  └──────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
     ❌ Fail    ✅ Pass
        │         │
        ▼         ▼
   Copilot     Post @copilot
   fixes       validate-pr trigger
   (via CI             │
   failure             ▼
   feedback)  ┌──────────────────┐
              │  Layer 3:         │
              │  validate-pr      │
              │  (independent)    │
              └────────┬─────────┘
                       │
                  ┌────┴────┐
                  │         │
               ❌ Fail    ✅ Pass
                  │         │
                  ▼         ▼
             @copilot    Ready for
             fix request  human review
                  │
                  ▼
             Copilot pushes
             new commits
                  │
                  ▼
             CI re-triggers
             (back to Layer 2)
```

---

## Alternatives Considered

### Run validate-pr inside GitHub Actions runner

- The validate-pr agent requires Docker services (Postgres, Azurite), a running Next.js dev server, and Playwright MCP browser tools.
- Running all of this inside a GitHub Actions runner is possible but expensive, complex (self-hosted runner with browser support), and duplicates infrastructure that Copilot's own agent runtime already provides.
- Rejected in favor of triggering Copilot via PR comments, which leverages its native environment.

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
- **Visible audit trail** — validation reports are posted as PR comments, giving reviewers full visibility into what was checked and how.
- **Cost efficient** — agentic validation only runs after cheap deterministic checks pass.

### Negative

- **Latency** — the sequential pipeline (CI → agentic validation) adds wall-clock time compared to parallel execution. Acceptable given the cost savings.
- **Comment noise** — multiple validation iterations generate several PR comments. Mitigated by the validate-pr agent updating existing comments rather than creating new ones.
- **Copilot dependency** — Layer 3 relies on Copilot coding agent being available and responsive. If Copilot is down, validation is skipped (CI still runs independently).

### Risks

- **Infinite loop** — if validation keeps failing and Copilot keeps pushing broken fixes, the loop could run indefinitely. Mitigated by the configurable iteration cap (default: 3).
- **Comment trigger reliability** — Copilot's response to `@copilot` mentions in PR comments may not always invoke the validate-pr agent correctly. May need prompt tuning over time.
- **Cost at scale** — each agentic validation run involves spinning up Docker services, running a dev server, and browser-based testing. For high-volume PRs, costs could grow. Mitigated by gating on CI and the iteration cap.
