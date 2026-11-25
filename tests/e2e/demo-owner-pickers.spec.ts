import { expect, test, type Page } from "@playwright/test";

// D26 in demo mode: the neighbourhood and type pickers on Settings and Your page, saved and still there after a reload,
// and the street address message.

const roleUrl = (params: Record<string, string>) => `/dev/roles?${new URLSearchParams(params).toString()}`;

async function openAsOwner(page: Page, path: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(roleUrl({ role: "owner", restaurant: "rest-daily-grind", to: path }));
  await page.waitForURL(`**${path}`, { timeout: 20_000 });
  await page.waitForSelector("main", { timeout: 20_000 });
}

test("Settings: pick a neighbourhood and a type, save, reload, and they are still there", async ({ page }) => {
  await openAsOwner(page, "/app/settings");
  await page.getByLabel("Neighbourhood").first().selectOption("Melville");
  await page.getByLabel(/What kind of place is it\?/).selectOption("bakery");
  await page.getByRole("button", { name: "Save settings" }).first().click();
  await page.reload();
  await expect(page.getByLabel("Neighbourhood").first()).toHaveValue("Melville");
  await expect(page.getByLabel(/What kind of place is it\?/)).toHaveValue("bakery");
});

test("Settings: a neighbourhood that is not on the list can be typed", async ({ page }) => {
  await openAsOwner(page, "/app/settings");
  await page.getByLabel("Neighbourhood").first().selectOption({ label: "Somewhere else, I will type it" });
  await page.getByLabel("Type your neighbourhood").fill("Sea Point");
  await page.getByRole("button", { name: "Save settings" }).first().click();
  await page.reload();
  await expect(page.getByLabel("Neighbourhood").first()).toHaveValue("__other");
  await expect(page.getByLabel("Type your neighbourhood")).toHaveValue("Sea Point");
});

test("Settings: an address with a phone number shows the message and is not saved", async ({ page }) => {
  await openAsOwner(page, "/app/settings");
  const address = page.getByLabel("Address", { exact: true });
  await address.fill("0821234567");
  await address.blur();
  await expect(page.getByRole("alert")).toContainText("Enter your street address, for example 12 Oxford Road.");
  await page.getByRole("button", { name: "Save settings" }).first().click();
  await page.reload();
  await expect(page.getByLabel("Address", { exact: true })).not.toHaveValue("0821234567");
});

test("Your page: pick a neighbourhood and a type, publish, reload, and they are still there", async ({ page }) => {
  await openAsOwner(page, "/app/page");
  await page.getByLabel("Neighbourhood").first().selectOption("Greenside");
  await page.getByLabel(/What kind of place is it\?/).selectOption("takeaway");
  await page.getByRole("button", { name: "Preview my page" }).click();
  await page.getByRole("button", { name: "Publish my page" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText(/Published\. Guests see this now/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Neighbourhood").first()).toHaveValue("Greenside");
  await expect(page.getByLabel(/What kind of place is it\?/)).toHaveValue("takeaway");
});

test("Your page: an invalid address shows the message and blocks the preview", async ({ page }) => {
  await openAsOwner(page, "/app/page");
  const address = page.getByLabel(/Street address/);
  await address.fill("www.mysite.co.za");
  await address.blur();
  await expect(page.getByRole("alert")).toContainText("Enter your street address, for example 12 Oxford Road.");
  await expect(page.getByRole("button", { name: "Preview my page" })).toBeDisabled();
});
