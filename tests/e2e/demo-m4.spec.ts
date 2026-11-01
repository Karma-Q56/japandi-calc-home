import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("till asks for pairing on a fresh device", async ({ page }) => {
  await page.goto("/dev/roles?role=staff&staff=staff-1&to=/stamp");
  await expect(page).toHaveURL(/\/stamp$/);
  await expect(page.locator("main")).toContainText(/Pair this till/);
});

test("team page lists staff and pairing", async ({ page }) => {
  await page.goto("/dev/roles?role=owner&restaurant=rest-daily-grind&to=/app/team");
  await expect(page).toHaveURL(/\/app\/team$/);
  await expect(page.locator("main")).toContainText(/Who works the till/);
});

test("audit page shows the log", async ({ page }) => {
  await page.goto("/dev/roles?role=owner&restaurant=rest-daily-grind&to=/app/audit");
  await expect(page).toHaveURL(/\/app\/audit$/);
  await expect(page.locator("main")).toContainText(/What happened/);
});
