import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("owner overview loads with stats and chart", async ({ page }) => {
  await page.goto("/dev/roles?role=owner&restaurant=rest-daily-grind&to=/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("main")).toContainText(/Your week at a glance/);
});

test("customers list and loyalty editor load", async ({ page }) => {
  await page.goto("/dev/roles?role=owner&restaurant=rest-daily-grind&to=/app/customers");
  await expect(page).toHaveURL(/\/app\/customers$/);
  await expect(page.locator("main")).toContainText(/Your regulars/);
  await page.goto("/dev/roles?role=owner&restaurant=rest-daily-grind&to=/app/loyalty");
  await expect(page).toHaveURL(/\/app\/loyalty$/);
  await expect(page.locator("main")).toContainText(/The card rules/);
});
