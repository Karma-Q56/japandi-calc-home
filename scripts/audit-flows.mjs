// Walk the main demo workflows through the real UI.
// Run against a built preview: AUDIT_BASE=http://127.0.0.1:5173 node scripts/audit-flows.mjs
import { chromium, expect } from "@playwright/test";

const BASE = (process.env.AUDIT_BASE ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const STORAGE_KEY = "patron-demo-v9";
const results = [];

async function runFlow(name, body) {
  const steps = [];
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 180)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(String(message.text()).slice(0, 180));
  });

  const check = async (label, action) => {
    try {
      await action();
      steps.push({ label, ok: true });
    } catch (error) {
      steps.push({
        label,
        ok: false,
        error: String(error instanceof Error ? error.message : error).slice(0, 300),
      });
      throw error;
    }
  };

  try {
    await body({ page, check });
    results.push({ flow: name, ok: true, steps, errors: [...new Set(errors)].slice(0, 3) });
  } catch {
    results.push({ flow: name, ok: false, steps, errors: [...new Set(errors)].slice(0, 3) });
  } finally {
    await page.close();
  }
}

async function role(page, params, path) {
  await page.goto(`${BASE}/dev/roles?${new URLSearchParams(params).toString()}`);
  await page.waitForURL(`**${path}`, { timeout: 20_000 });
  // The preview is server-rendered; give React a moment to attach click handlers.
  await page.waitForTimeout(800);
}

async function session(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), STORAGE_KEY);
}

const browser = await chromium.launch();

await runFlow("find a place", async ({ page, check }) => {
  await page.goto(`${BASE}/find`);
  await page.waitForTimeout(800);
  await check("search by name", async () => {
    await page.getByPlaceholder("The Daily Grind or Parkhurst").fill("Sunrise");
    await expect(page.locator(".fd-card")).toHaveCount(1);
    await expect(page.locator(".fd-card")).toContainText("Sunrise Bakes");
  });
  await check("filter by category and neighbourhood", async () => {
    await page.getByPlaceholder("The Daily Grind or Parkhurst").fill("");
    await page.getByRole("button", { name: "Cafes", exact: true }).click();
    await expect(page.locator(".fd-card")).toHaveCount(1);
    await expect(page.locator(".fd-card")).toContainText("The Daily Grind");
    await page.getByLabel("Neighbourhood").selectOption("Parkhurst");
    await expect(page.locator(".fd-card")).toHaveCount(1);
  });
  await check("show member offers and clear the filters", async () => {
    await page.getByLabel("Neighbourhood").selectOption("All neighbourhoods");
    await page.getByRole("button", { name: "Member offers", exact: true }).click();
    await expect(page.locator(".fd-card")).toHaveCount(2);
    await page.getByRole("button", { name: "All places", exact: true }).click();
    await expect(page.locator(".fd-card")).toHaveCount(3);
  });
  await check("Find keeps the result list in view", async () => {
    await page.getByRole("button", { name: "Find", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Around the neighbourhood/ })).toBeVisible();
  });
});

await runFlow("join a card", async ({ page, check }) => {
  await page.goto(`${BASE}/r/daily-grind/join?src=audit`);
  await check("open the venue join page", async () => {
    await expect(page.getByRole("heading", { name: /Join the regulars/ })).toBeVisible();
    await page.waitForTimeout(800);
  });
  await check("start joining", async () => {
    await page.getByRole("button", { name: "Join The Daily Grind", exact: true }).click();
  });
  await check("enter guest details", async () => {
    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible();
    await page.locator('input[autocomplete="given-name"]').fill("Audit Guest");
    await page.locator('input[autocomplete="tel"]').fill(`+2782${String(Date.now()).slice(-7)}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  });
  await check("show the plain quick check", async () => {
    await expect(
      page.getByText(
        "In the full app, we send a code by text to confirm your mobile number. This demo skips that step.",
      ),
    ).toBeVisible();
    await expect(page.getByText("M9")).toHaveCount(0);
  });
  await check("finish joining", async () => {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/r/daily-grind/card", { timeout: 20_000 });
    await expect(page.getByText("The Daily Grind").first()).toBeVisible();
  });
  await check("sign the guest out from Me", async () => {
    await page.goto(`${BASE}/me/settings`);
    await page.waitForTimeout(800);
    await page.getByTestId("guest-logout").click();
    await page.waitForURL((url) => url.pathname === "/");
    const saved = await session(page);
    expect(saved.session).toEqual({ role: "guest" });
  });
});

await runFlow("stamp and redeem at the till", async ({ page, check }) => {
  await role(
    page,
    { role: "staff", restaurant: "rest-daily-grind", staff: "staff-1", to: "/stamp" },
    "/stamp",
  );
  await check("pair the till", async () => {
    await page.getByRole("button", { name: "Pair this device as a till (demo shortcut)" }).click();
    await expect(page.getByRole("heading", { name: "Who’s stamping?" })).toBeVisible();
  });
  await check("unlock with a staff PIN", async () => {
    await page.locator("select").first().selectOption({ label: "Mia" });
    await page.locator(".pin-input").fill("1234");
    await page.getByRole("button", { name: "Unlock till" }).click();
    await expect(page.getByRole("heading", { name: "The Daily Grind" })).toBeVisible();
  });

  const picks = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("patron-demo-v9") ?? "{}");
    const customers = new Map(state.customers.map((customer) => [customer.id, customer]));
    const memberships = state.memberships.filter(
      (membership) => membership.restaurantId === "rest-daily-grind",
    );
    const eligible = memberships
      .map((membership) => ({ membership, customer: customers.get(membership.customerId) }))
      .filter((row) => row.customer?.phoneE164);
    const reward = state.rewards.find(
      (item) => item.restaurantId === "rest-daily-grind" && !item.redeemedAt,
    );
    const rewardMembership = reward
      ? memberships.find((membership) => membership.id === reward.membershipId)
      : undefined;
    const rewardCustomer = rewardMembership
      ? customers.get(rewardMembership.customerId)
      : undefined;
    const stampPhones = eligible
      .filter(({ membership }) => {
        if (!membership.lastVisitAt) return true;
        return state.now - Date.parse(membership.lastVisitAt) > 6 * 60 * 60 * 1000;
      })
      .map(({ customer }) => customer.phoneE164);
    return {
      stampPhones: (stampPhones.length
        ? stampPhones
        : eligible.map(({ customer }) => customer.phoneE164)
      ).slice(0, 8),
      rewardPhone: rewardCustomer?.phoneE164 ?? null,
    };
  });

  await check("look up a guest and add a stamp", async () => {
    let added = false;
    for (const phone of picks.stampPhones) {
      await page.locator('input[placeholder*="PT"]').fill(phone);
      await page.getByRole("button", { name: "Look up" }).click();
      await page.getByRole("button", { name: "Add stamp" }).click();
      await page.waitForTimeout(300);
      if (await page.getByText(/Stamp added/).count()) {
        added = true;
        break;
      }
    }
    expect(added, "a guest was stamped").toBe(true);
    if (await page.getByRole("button", { name: "Skip" }).count()) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
  });

  await check("redeem a ready reward", async () => {
    expect(picks.rewardPhone, "a seeded reward guest").toBeTruthy();
    await page.locator('input[placeholder*="PT"]').fill(picks.rewardPhone);
    await page.getByRole("button", { name: "Look up" }).click();
    await page
      .getByRole("button", { name: /^Redeem:/ })
      .first()
      .click();
    await expect(page.getByText("Reward redeemed.")).toBeVisible();
  });

  await check("redeem the TUESDAY offer code", async () => {
    await page.getByLabel("Offer code").fill("TUESDAY");
    await page.getByRole("button", { name: "Redeem offer" }).click();
    await expect(page.getByText(/(redemption|redeemed)/i).last()).toBeVisible();
  });

  await check("unpair the till and sign out", async () => {
    await page.getByTestId("unpair-till").click();
    await expect(page.getByRole("heading", { name: "Pair this till." })).toBeVisible();
    await page.getByTestId("staff-logout").click();
    await page.waitForURL((url) => url.pathname === "/");
  });
});

await runFlow("create and send a campaign", async ({ page, check }) => {
  const campaignName = `Audit ${Date.now()}`;
  await role(
    page,
    { role: "owner", restaurant: "rest-daily-grind", to: "/app/campaigns/new" },
    "/app/campaigns/new",
  );
  await check("name the campaign", async () => {
    await page.getByLabel("Campaign name").fill(campaignName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  });
  await check("review the message and audience", async () => {
    await expect(page.getByRole("heading", { name: "What do you want to say?" })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  });
  await check("review the cost", async () => {
    await expect(page.getByRole("heading", { name: "What it will cost" })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  });
  await check("publish and send", async () => {
    await expect(page.getByRole("heading", { name: "Publish this campaign?" })).toBeVisible();
    const sendConfirm = page.locator('label:has-text("Type SEND") input');
    if (await sendConfirm.count()) await sendConfirm.fill("SEND");
    await page.getByRole("button", { name: "Publish and send" }).click();
    await page.waitForURL(
      (url) => url.pathname.startsWith("/app/campaigns/") && !url.pathname.endsWith("/new"),
      { timeout: 20_000 },
    );
  });
  await check("campaign is queued", async () => {
    const saved = await session(page);
    const campaign = saved.campaigns.find((item) => item.name === campaignName);
    expect(campaign, "the new campaign is saved").toBeTruthy();
    expect(["sending", "sent", "scheduled"]).toContain(campaign.status);
  });
});

await runFlow("edit, publish and restore the public page", async ({ page, check }) => {
  const stamp = new Date().toISOString().slice(11, 19);
  await role(page, { role: "owner", restaurant: "rest-daily-grind", to: "/app/page" }, "/app/page");
  await check("edit the tagline", async () => {
    await page.getByLabel(/Tagline/).fill(`Fresh coffee, audit ${stamp}`);
    await page.getByRole("button", { name: "Preview my page" }).click();
  });
  await check("publish the page", async () => {
    await page.getByRole("button", { name: "Publish my page" }).click();
    await page.getByRole("button", { name: "Yes, publish" }).click();
    await expect(page.getByText("Published. Guests see this now.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Earlier versions" })).toBeVisible();
  });
  await check("restore the version as a draft", async () => {
    await page.getByRole("button", { name: "Restore" }).first().click();
    await expect(page.getByText(/You are editing the version from/)).toBeVisible();
  });
  await check("sign the owner out", async () => {
    await page.getByTestId("owner-account").click();
    await page.getByTestId("owner-logout").click();
    await page.waitForURL((url) => url.pathname === "/");
  });
});

await runFlow("operator signs out", async ({ page, check }) => {
  await role(page, { role: "operator", to: "/ops/restaurants" }, "/ops/restaurants");
  await check("use the visible operator Log out", async () => {
    await page.getByTestId("operator-logout").click();
    await page.waitForURL((url) => url.pathname === "/");
    const saved = await session(page);
    expect(saved.session).toEqual({ role: "guest" });
  });
});

await browser.close();

let failures = 0;
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.flow}`);
  for (const step of result.steps) {
    console.log(
      `  ${step.ok ? "pass" : "FAIL"} ${step.label}${step.error ? `: ${step.error}` : ""}`,
    );
  }
  if (result.errors?.length) console.log(`  page errors: ${result.errors.join(" | ")}`);
  if (!result.ok) failures += 1;
}
console.log(`\n${results.length - failures} of ${results.length} flows passed.`);
process.exitCode = failures > 0 ? 1 : 0;
