---
name: e2e
description: Use when the user asks to validate, test, or verify a feature end-to-end using the browser. Triggers Playwright MCP browser tools to walk through the app at localhost:3000.
---

Run an end-to-end validation of the requested feature using the Playwright MCP browser tools.

## Steps

1. **Confirm dev server** — Check if `http://localhost:3000` is reachable with `browser_navigate`. If it fails, tell the user to run `npm run dev` (or `docker compose up`) and wait.

2. **Navigate to the feature** — Open `http://localhost:3000` and go to the relevant page or flow.

3. **Walk through the feature step by step** — Interact with the UI as a real user would:
   - Fill in forms
   - Click buttons
   - Follow multi-step flows

4. **Assert expected states** — After each action verify:
   - Correct UI elements appear / disappear
   - Success or error messages are shown
   - URL changes match expected routing
   - Use `browser_network_requests` to check API calls and response codes
   - Use `browser_console_messages` to catch JS errors

5. **Report results**:
   - ✅ **PASS** — what worked correctly
   - ❌ **FAIL** — what did not work, with a screenshot via `browser_take_screenshot` and the specific assertion that failed
