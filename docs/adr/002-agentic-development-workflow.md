# ADR 002 — Agentic Development Workflow

**Status:** Accepted
**Date:** 2026-03-01
**Last updated:** 2026-04-19

---

## Context

SplitVibe is built primarily through agentic workflows: features are
described as GitHub issues with explicit acceptance criteria, and
custom Copilot agents handle implementation and validation. We need a
workflow that combines this agentic loop with deterministic guardrails
so that every PR reaching a human reviewer has a credible quality
signal.

---

## Decision

**Adopt a two-layer workflow combining custom Copilot agents (Layer 1)
with deterministic CI checks (Layer 2). Every PR carries an agent-authored
validation comment plus a green CI status before a human is asked to
merge. Additional automated guardrails (security, code quality, etc.)
will be layered in over time.**

### Custom agents

Two custom agents drive the workflow. Both are runtime-agnostic and
their definitions live in `.github/agents/`.

- **implement-agent** (`.github/agents/implement.agent.md`) — Reads a
  GitHub issue, creates a feature branch, implements the change via
  TDD, opens a PR with `Closes #N`, and then invokes the
  validate-pr-agent against the PR.
- **validate-pr-agent** (`.github/agents/validate-pr.agent.md`) —
  Validates a PR's acceptance criteria from the user's perspective using
  the live dev environment (Docker, Next.js dev server, Playwright MCP
  for browser interactions, direct API calls). Posts the report as a PR
  comment using `gh pr comment`, updating any prior comment in place.

### Layer 1 — Agent-driven implementation and validation

The same agents can be invoked from two runtimes:

- **Local (Copilot CLI)** — A developer runs `copilot` and dispatches
  the implement-agent against an issue. `gh` uses the developer's own
  authenticated session, so the validation comment is posted with no
  extra setup.
- **Cloud (GitHub Copilot coding agent)** — Assigning an issue to
  Copilot dispatches the same implement-agent inside a managed cloud VM
  with full shell, Docker, and browser access.

In both runtimes the implement-agent invokes the validate-pr-agent via
the `task` / `agent` tool ([Custom agents reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration#tool-aliases)),
and the validate-pr-agent leaves the validation report as a PR comment.

### Layer 2 — Deterministic CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR event (`opened`,
`synchronize`, `reopened`) and executes, in order:

1. **typecheck** — `npm run typecheck`
2. **lint** — `npm run lint`
3. **test** — `npm test` (Vitest unit/integration)
4. **build** — `npm run build` (production build smoke-check)

These checks need only Node.js and a Postgres service container — no
browser, no agentic compute, no secrets beyond the workflow's built-in
`GITHUB_TOKEN`. They catch regressions cheaply on every push, including
pushes that happen after the initial agent run.

### Quality gate before merge

A PR is considered ready for human review when:

1. The validate-pr-agent has posted (or updated) its validation comment
   with a passing report.
2. All Layer 2 CI checks are green.

The human reviewer makes the final merge decision based on the diff,
the validation comment, and the CI status.

### Flow Diagram

```
  Issue assigned to Copilot              Developer runs `copilot` locally
  (cloud coding agent runtime)            (Copilot CLI runtime)
         │                                         │
         └──────────────────┬──────────────────────┘
                            ▼
  ┌───────────────────────────────────────┐
  │  implement-agent                       │
  │  (TDD + self-check)                    │
  │  → invokes validate-pr-agent           │
  │  → posts/updates report on PR via `gh` │
  └──────────┬────────────────────────────┘
             │ Opens / updates PR
             ▼
  ┌─────────────────────────────────┐
  │  ci.yml (Layer 2)               │
  │  typecheck → lint → test → build │
  └──────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
     ❌ Fail    ✅ Pass + validation comment
        │         │
        ▼         ▼
    Status     Ready for
    check      human review
    fails PR
```

---

## Operational requirements

### `GH_TOKEN` PAT in the `copilot` environment (cloud runtime only)

The validate-pr-agent posts its report with `gh pr comment`. In the
**cloud Copilot coding agent runtime**, the default token (and the
out-of-the-box `github` MCP server's token) is **read-only on pull
requests** — `gh` calls return
`GraphQL: Resource not accessible by integration (addComment)` /
HTTP 403.

To enable comment posting from the cloud runtime, a fine-grained PAT is
exposed to the agent as the **`GH_TOKEN`** environment variable. `gh`
reads `GH_TOKEN` automatically, so any `gh pr comment …` call uses the
PAT with no further configuration.

| Item | Value |
|---|---|
| PAT type | Fine-grained, repository-scoped to `marcgs/SplitVibe` |
| PAT permissions | `Pull requests: Read and write`, `Contents: Read`, `Metadata: Read` |
| Stored as | Environment secret named `GH_TOKEN` |
| Stored in | The **`copilot`** GitHub Actions environment ([Settings → Environments → `copilot`](https://github.com/marcgs/SplitVibe/settings/environments)) |

> **Important:** The cloud Copilot agent only injects secrets from the
> `copilot` environment into its runtime — **not** repository-level
> Actions secrets. See
> [Setting environment variables in Copilot's environment](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment#setting-environment-variables-in-copilots-environment).
> A `GH_TOKEN` secret stored at the repository level is silently
> invisible to the agent.

PR comments posted from the cloud runtime are authored by the PAT
owner (a real GitHub user), not by `copilot-swe-agent[bot]`. Rotate the
PAT before its expiration (max 1 year for fine-grained PATs) to avoid a
sudden return of HTTP 403 on validation runs.

The local CLI runtime needs no special configuration: it uses the
developer's own `gh auth` session.

---

## Alternatives Considered

### Single-agent approach (implement-agent does everything)

The implement-agent could self-validate without delegating to a
separate validate-pr-agent. Rejected to keep validation logic isolated
and to make it possible to re-run validation independently from
implementation.

### Run validation inside CI instead of via agents

Pre-written Playwright tests could be executed in `ci.yml` directly,
removing the agentic dependency. Rejected for now: it loses
AI-driven exploratory validation against acceptance criteria written in
natural language and would duplicate logic the validate-pr-agent
already encodes. Worth revisiting once Playwright coverage grows.

### Single workflow combining CI and validation as jobs

Rejected: shared permissions scope violates least-privilege and
prevents re-running validation independently of the CI checks.

---

## Consequences

### Positive

- **Same agents, two runtimes** — implement-agent and validate-pr-agent
  work identically from the local Copilot CLI and from the cloud
  Copilot coding agent. Developers can pick whichever fits their
  workflow.
- **Every PR carries explicit signals** — an agent-authored validation
  comment plus a green CI status check, both visible in the PR
  conversation.
- **Fast deterministic feedback** — Layer 2 catches type errors, lint
  issues, broken tests, and build regressions in minutes on every push
  without burning agentic compute.
- **Minimal secret surface** — Layer 2 needs only the built-in
  `GITHUB_TOKEN`. Layer 1 needs a single fine-grained PAT
  (`GH_TOKEN`) and only in the cloud runtime.
- **Auditable** — CI results are standard status checks; validation
  reports live as PR comments.

### Negative

- **No automated re-validation on subsequent pushes** — pushes after the
  initial agent run are only covered by Layer 2. Re-running the
  validate-pr-agent on an open PR currently requires a developer to
  invoke it locally or re-dispatch the implement-agent.
- **Self-validation blind spot** — when both implementation and
  validation come from the same session, a systematic misreading of an
  acceptance criterion can pass undetected. Mitigated by human review
  and (in the future) by additional independent guardrails.

### Risks

- **PAT expiration** — the cloud `GH_TOKEN` PAT will eventually expire
  and validate-pr-agent comments will start returning HTTP 403. Failure
  is loud and obvious in the next implement-agent run; mitigation is
  rotation before expiry.
- **Platform evolution** — capabilities of the Copilot CLI and cloud
  coding agent are still changing rapidly; the integration points
  documented here may shift.

---

## Future Guardrails

The Layer 2 quality gate is intentionally minimal today. Planned
additions, to be introduced as separate ADRs or iterative changes when
the need is clear:

- **Security scanning** — secret scanning enforcement, dependency
  vulnerability scanning (e.g. GitHub Dependabot / `npm audit` gating),
  CodeQL or equivalent SAST.
- **Code quality** — coverage thresholds, complexity / dead-code
  checks, Copilot Code Review ruleset for static review feedback on
  every PR.
- **Independent agentic re-validation** — automated re-run of the
  validate-pr-agent on subsequent pushes, once the platform exposes a
  clean trigger that does not require sub-PRs.
- **Deterministic E2E in CI** — once Playwright coverage is sufficient,
  run the suite directly in `ci.yml` as an additional safety net under
  the agentic validation.
- **Performance / bundle-size budgets** — guard against regressions in
  the production build.

Each new guardrail should preserve the current properties: cheap to
run, deterministic where possible, and visible in the PR conversation.

Many of these are natural fits for [GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)
(tech preview) — Markdown intent files under `.github/workflows/`
compiled with `gh aw compile`, read-only by default with `safe-outputs`
for PR comments, letting us add agentic guardrails without bespoke
runner plumbing.
