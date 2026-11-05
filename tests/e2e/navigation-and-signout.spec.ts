import { expect, test } from "@playwright/test";

const roleUrl = (params: Record<string, string>) =>
  `/dev/roles?${new URLSearchParams(params).toString()}`;

async function expectBack(page: import("@playwright/test").Page) {
  await expect(page.locator("[data-back-link]").first()).toBeVisible();
}

async function expectHomeAndClearSession(page: import("@playwright/test").Page) {
  await page.waitForURL((url) => url.pathname === "/");
  const session = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem("patron-demo-v9") ?? "{}").session,
  );
  expect(session).toEqual({ role: "guest" });
}

test("every non-tab screen has a back control", async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of [
    "/r/daily-grind",
    "/r/sunrise-bakes",
    "/r/oak-table",
    "/r/daily-grind/join",
    "/privacy",
    "/terms",
    "/contact",
    "/feedback",
    "/suggest",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/signup",
  ]) {
    await test.step(`back: ${path}`, async () => {
      await page.goto(path);
      await expectBack(page);
    });
  }

  await page.goto(roleUrl({ role: "guest", customer: "customer-1", to: "/r/daily-grind/card" }));
  await page.waitForURL("**/r/daily-grind/card");
  await expectBack(page);

  await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: "/app/loyalty" }));
  await page.waitForURL("**/app/loyalty");
  await expectBack(page);

  for (const path of [
    "/app/audit",
    "/app/campaigns",
    "/app/campaigns/new",
    "/app/campaigns/campaign-1",
    "/app/challenges",
    "/app/credit",
    "/app/customers/customer-1",
    "/app/design",
    "/app/feedback",
    "/app/ideas",
    "/app/lists",
    "/app/loyalty",
    "/app/menu",
    "/app/onboarding",
    "/app/page",
    "/app/qr",
    "/app/referrals",
    "/app/settings",
    "/app/specials",
    "/app/team",
  ]) {
    await test.step(`back: ${path}`, async () => {
      await page.goto(path);
      await expectBack(page);
    });
  }

  await page.goto(roleUrl({ role: "operator", to: "/demo/outbox" }));
  await page.waitForURL("**/demo/outbox");
  await expectBack(page);
});

test("login offers account and password links in demo mode", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
});

test("the demo pill starts small at the bottom left and stays out of the page flow", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page.waitForTimeout(800);
  const pill = page.locator("[data-demo-pill]");
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeLessThan(80);
  expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 130);
  const toggle = pill.locator(".demo-control-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("guest signs out from Me", async ({ page }) => {
  await page.goto(roleUrl({ role: "guest", customer: "customer-1", to: "/me/settings" }));
  await page.waitForURL("**/me/settings");
  await page.waitForTimeout(800);
  await page.getByTestId("guest-logout").click();
  await expectHomeAndClearSession(page);
});

test("owner signs out from the profile menu", async ({ page }) => {
  await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: "/app" }));
  await page.waitForURL("**/app");
  await page.waitForTimeout(800);
  await page.getByTestId("owner-account").click();
  await page.getByTestId("owner-logout").click();
  await expectHomeAndClearSession(page);
});

test("staff unpairs the till and signs out", async ({ page }) => {
  await page.goto(
    roleUrl({
      role: "staff",
      restaurant: "rest-daily-grind",
      staff: "staff-1",
      to: "/stamp",
    }),
  );
  await page.waitForURL("**/stamp");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Pair this device as a till (demo shortcut)" }).click();
  await expect(page.getByTestId("unpair-till")).toBeVisible();
  await page.getByTestId("unpair-till").click();
  await expect(page.getByRole("heading", { name: "Pair this till." })).toBeVisible();
  await page.getByTestId("staff-logout").click();
  await expectHomeAndClearSession(page);
});

test("operator signs out", async ({ page }) => {
  await page.goto(roleUrl({ role: "operator", to: "/ops/restaurants" }));
  await page.waitForURL("**/ops/restaurants");
  await page.waitForTimeout(800);
  await page.getByTestId("operator-logout").click();
  await expectHomeAndClearSession(page);
});
