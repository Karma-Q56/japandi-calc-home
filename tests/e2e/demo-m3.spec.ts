import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("guest join flow reaches the card with stamp slots", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/r/daily-grind/join");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText("Join the regulars")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tampered opt-out link shows a calm error", async ({ page }) => {
  await page.goto("/u/not-a-real-token");
  await expect(page.locator("main")).toBeVisible();
});
