import { test, expect } from "@playwright/test";

test("login page renders the email and password fields", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in|log in|login/i })
  ).toBeVisible();
});
