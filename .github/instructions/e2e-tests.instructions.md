---
applyTo: "tests/e2e/**/*.ts"
---

# E2E Test Conventions (Playwright)

- Name test files with a `.spec.ts` suffix (e.g., `groups.spec.ts`, `settlements.spec.ts`).
- Use `test` and `expect` from `@playwright/test` — not from Vitest.
- Use the `baseURL` from `playwright.config.ts` (`http://localhost:3000`) — navigate with relative paths: `page.goto("/groups")`.
- Wait for page readiness with `await expect(page.locator(...)).toBeVisible()` before interacting.
- Prefer user-visible selectors: `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder` over CSS selectors.
- Use `test.describe` to group related flows (e.g., `test.describe("Group creation", ...)`).
- For authenticated flows, sign in via the mock credentials provider (dev only) before each test or in a `test.beforeEach`.
- Take screenshots for visual assertions: `await expect(page).toHaveScreenshot()`.
- Keep tests independent — each test should set up its own state and not depend on other tests' side effects.
