import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 360, height: 844 } });

for (const path of [
  "/demo",
  "/demo/status",
  "/r/daily-grind",
  "/r/daily-grind/join",
  "/pricing",
  "/faq",
  "/privacy",
]) {
  test(`no horizontal scroll at 360px: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
}
