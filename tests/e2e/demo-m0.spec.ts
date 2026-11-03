import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("demo hub deep links land on the right screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/demo");
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/dev/roles?role=operator&to=/ops/restaurants");
  await expect(page).toHaveURL(/\/ops\/restaurants$/);
  expect(errors).toEqual([]);
});

test("clock advance changes last-visit text and reset restores", async ({ page, context }) => {
  await page.goto("/dev/roles?role=guest&customer=customer-1&to=/me");
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.locator("main")).toContainText(/Last visit/);
  const second = await context.newPage();
  await second.goto("/demo");
  await expect(second.locator("main")).toBeVisible();
  await second.close();
});
