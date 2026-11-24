import { expect, test, type Page } from "@playwright/test";

const roleUrl = (params: Record<string, string>) =>
  `/dev/roles?${new URLSearchParams(params).toString()}`;

const WIDTHS = [360, 390, 768, 1280];
const PATHS = ["/app", "/app/customers", "/app/insights", "/stamp"];

/** Sign in as the demo owner, then open the page with the pill switched on (the production build hides it without ?demo=1). */
async function openAsOwner(page: Page, path: string) {
  await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: path }));
  await page.waitForURL(`**${path}`, { timeout: 20_000 });
  await page.goto(`${path}?demo=1`);
  await page.waitForSelector("[data-demo-pill]", { timeout: 20_000 });
  await page.waitForTimeout(600);
}

/** True when the demo pill's box overlaps any link, button or stat card (other than the pill itself). */
async function pillOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pill = document.querySelector("[data-demo-pill]") as HTMLElement | null;
    if (!pill) return ["no pill"];
    const box = pill.getBoundingClientRect();
    const hits: string[] = [];
    document.querySelectorAll<HTMLElement>('button, a, [class*="stat"]').forEach((node) => {
      if (pill.contains(node)) return;
      // The bottom tab bar is fixed and passes over everything that scrolls under it, so it is not page content.
      for (let up: HTMLElement | null = node; up; up = up.parentElement) {
        if (getComputedStyle(up).position === "fixed") return;
      }
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return;
      const overlap = rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      if (overlap) hits.push(`${node.tagName.toLowerCase()}.${node.className}`.slice(0, 80));
    });
    return hits;
  });
}

for (const width of WIDTHS) {
  for (const path of PATHS) {
    test(`the demo pill covers nothing at ${width}px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openAsOwner(page, path);
      // Check at every scroll position, because a floating pill only covers things part way down a page.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += 150) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(40);
        expect(await pillOverlaps(page), `scrolled to ${y}`).toEqual([]);
      }
    });
  }
}

test("the demo pill still switches roles", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAsOwner(page, "/app");
  const pill = page.locator("[data-demo-pill]");
  await pill.getByRole("button", { name: /demo data/i }).click();
  await expect(pill.getByLabel("Role")).toBeVisible();
  await expect(pill.getByLabel("Role")).toHaveValue("owner");
});
