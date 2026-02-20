import { test, expect } from "@playwright/test";

test("smoke: home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/splitvibe/i);
});
