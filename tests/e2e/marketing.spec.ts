import { expect, test } from "@playwright/test";

test("marketing home page renders with the existing title and design", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Patron/);
  await expect(page.locator("main")).toBeVisible();
});
