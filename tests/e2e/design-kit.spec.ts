import { expect, test } from "@playwright/test";

const roleUrl = (params: Record<string, string>) =>
  `/dev/roles?${new URLSearchParams(params).toString()}`;

async function waitForRole(page: import("@playwright/test").Page, path: string) {
  await page.waitForURL(`**${path}`, { timeout: 20_000 });
  await page.waitForTimeout(600);
}

async function visiblePrimaryCount(page: import("@playwright/test").Page) {
  return page.locator("[data-primary], .builder-primary, .search-submit").evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0
      );
    }).length,
  );
}

test("the design kit catalogue renders every shared piece", async ({ page }) => {
  await page.goto("/dev/kit");
  await expect(page.getByRole("heading", { name: "One kit, every surface." })).toBeVisible();
  for (const name of [
    "Colour",
    "Type",
    "Buttons",
    "Fields",
    "Filter pills",
    "Tabs",
    "Badges and pills",
    "Stat cards",
    "Page header",
    "Empty, loading and toast",
    "Drawer",
    "Avatar, venue and stamps",
    "Back link",
  ]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
});

test("owner navigation scrolls under the header at 375px without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: "/app" }));
  await waitForRole(page, "/app");
  const nav = page.locator(".ox-mobile-nav");
  await expect(nav).toBeVisible();
  const metrics = await nav.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    links: [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect().height),
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(Math.min(...metrics.links)).toBeGreaterThanOrEqual(44);
  const pageWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.innerWidth + 1);
});

test("each covered page has at most one primary action", async ({ page }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];
  const publicPages = [
    "/",
    "/for-diners",
    "/for-business",
    "/pricing",
    "/case-studies",
    "/how-it-works",
    "/faq",
    "/find",
    "/contact",
    "/suggest",
    "/feedback",
    "/login",
  ];
  for (const path of publicPages) {
    await page.goto(path);
    await page.waitForTimeout(350);
    const count = await visiblePrimaryCount(page);
    if (count > 1) failures.push(`${path}: ${count} primary actions`);
  }

  const ownerPages = [
    "/app",
    "/app/insights",
    "/app/reports",
    "/app/customers",
    "/app/referrals",
    "/app/campaigns",
    "/app/specials",
    "/app/credit",
    "/app/loyalty",
    "/app/challenges",
    "/app/design",
    "/app/page",
    "/app/menu",
    "/app/qr",
    "/app/team",
    "/app/feedback",
    "/app/audit",
    "/app/settings",
    "/app/lists",
  ];
  for (const path of ownerPages) {
    await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: path }));
    try {
      await waitForRole(page, path);
    } catch {
      failures.push(`${path}: did not open`);
      continue;
    }
    const count = await visiblePrimaryCount(page);
    if (count > 1) failures.push(`${path}: ${count} primary actions`);
  }

  const rolePages = [
    { role: "guest", customer: "customer-1", path: "/me" },
    { role: "guest", customer: "customer-1", path: "/r/daily-grind/card" },
    { role: "staff", path: "/stamp" },
    { role: "operator", path: "/ops/restaurants" },
  ];
  for (const entry of rolePages) {
    const params: Record<string, string> = {
      role: entry.role,
      to: entry.path,
      restaurant: "rest-daily-grind",
    };
    if ("customer" in entry) params.customer = entry.customer;
    await page.goto(roleUrl(params));
    try {
      await waitForRole(page, entry.path);
    } catch {
      failures.push(`${entry.path}: did not open`);
      continue;
    }
    const count = await visiblePrimaryCount(page);
    if (count > 1) failures.push(`${entry.path}: ${count} primary actions`);
  }

  await page.goto("/r/daily-grind/join");
  await page.waitForTimeout(350);
  const joinCount = await visiblePrimaryCount(page);
  if (joinCount > 1) failures.push(`/r/daily-grind/join: ${joinCount} primary actions`);
  expect(failures).toEqual([]);
});
