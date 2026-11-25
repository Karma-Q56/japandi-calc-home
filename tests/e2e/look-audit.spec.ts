import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Opens every owner, guest, till and operator screen in demo mode and checks that
 * everything that can be pressed looks like it can be pressed (D28 item 1).
 */

const WIDTHS = [360, 768, 1280];
const RESTAURANT = "rest-daily-grind";

type Screen = {
  path: string;
  role?: "guest" | "staff" | "owner" | "operator";
  /** Extra steps that open a part of the page, such as a tab. */
  then?: (page: Page) => Promise<void>;
  name?: string;
};

const roleUrl = (screen: Screen) => {
  const params = new URLSearchParams({
    role: screen.role!,
    restaurant: RESTAURANT,
    to: screen.path,
  });
  if (screen.role === "guest") params.set("customer", "customer-1");
  return `/dev/roles?${params.toString()}`;
};

async function open(page: Page, screen: Screen) {
  if (screen.role) {
    await page.goto(roleUrl(screen));
    await page.waitForURL((url) => url.pathname === screen.path.split("?")[0], {
      timeout: 20_000,
    });
  } else await page.goto(screen.path);
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  await screen.then?.(page);
}

const tab = (name: string) => async (page: Page) => {
  await page.locator(".section-tab", { hasText: name }).first().click();
  await page.waitForTimeout(200);
};

/** Pairs this device, signs in the first demo staff member and looks up a guest. */
async function unlockTill(page: Page) {
  await page.getByRole("button", { name: "Pair this device as a till (demo shortcut)" }).click();
  await page.getByLabel("Your name").selectOption({ index: 1 });
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "Unlock till" }).click();
  await expect(page.getByRole("heading", { name: /you're on the till\./ })).toBeVisible();
}

async function findGuest(page: Page) {
  await unlockTill(page);
  const code = await page.evaluate((restaurantId) => {
    for (const key of Object.keys(localStorage)) {
      try {
        const state = JSON.parse(localStorage.getItem(key) ?? "") as {
          memberships?: Array<{ restaurantId: string; customerId: string }>;
          customers?: Array<{ id: string; memberCode: string }>;
        };
        const membership = state.memberships?.find((m) => m.restaurantId === restaurantId);
        const found = state.customers?.find((c) => c.id === membership?.customerId);
        if (found) return found.memberCode;
      } catch {
        // Not the demo data.
      }
    }
    return "";
  }, RESTAURANT);
  expect(code, "a demo member code").not.toBe("");
  await page.getByLabel("Member code or phone").fill(code);
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByRole("button", { name: "Add stamp" })).toBeEnabled();
}

const publicScreens: Screen[] = [
  "/find",
  "/login",
  "/signup",
  "/forgot-password",
  "/suggest",
  "/feedback",
  "/demo",
  "/demo/status",
  "/demo/outbox",
  "/r/daily-grind",
  "/r/daily-grind/join",
].map((path) => ({ path }));

const owner = (path: string, extra: Partial<Screen> = {}): Screen => ({
  path,
  role: "owner",
  ...extra,
});

const ownerScreens: Screen[] = [
  ...[
    "/app",
    "/app/insights",
    "/app/reports",
    "/app/customers",
    "/app/customers/customer-1",
    "/app/referrals",
    "/app/campaigns",
    "/app/campaigns/new",
    "/app/campaigns/campaign-1",
    "/app/campaigns/campaign-draft-weekend",
    "/app/specials",
    "/app/credit",
    "/app/billing",
    "/app/loyalty",
    "/app/challenges",
    "/app/design",
    "/app/page",
    "/app/menu",
    "/app/qr",
    "/app/team",
    "/app/locations",
    "/app/feedback",
    "/app/ideas",
    "/app/audit",
    "/app/settings",
    "/app/lists",
    "/app/onboarding",
  ].map((path) => owner(path)),
  ...["Stamp card", "Rewards", "Tiers", "Spin"].map((name) =>
    owner("/app/loyalty", { name: `/app/loyalty (${name} tab)`, then: tab(name) }),
  ),
  ...["Lists", "Birthdays"].map((name) =>
    owner("/app/customers", { name: `/app/customers (${name} tab)`, then: tab(name) }),
  ),
];

const guestScreens: Screen[] = [
  "/me",
  "/me/settings",
  "/me/restaurants",
  "/me/restaurants/daily-grind",
  "/r/daily-grind/card",
].map((path) => ({ path, role: "guest" }));

const tillScreens: Screen[] = [
  { path: "/stamp", role: "staff", name: "/stamp (pairing)" },
  { path: "/stamp", role: "staff", name: "/stamp (signed in)", then: unlockTill },
  { path: "/stamp", role: "staff", name: "/stamp (guest found)", then: findGuest },
];

const operatorScreens: Screen[] = [
  "/ops/restaurants",
  "/ops/restaurants/new",
  `/ops/restaurants/${RESTAURANT}`,
  `/ops/restaurants/${RESTAURANT}/look`,
  `/ops/restaurants/${RESTAURANT}/qr`,
  "/ops/campaigns",
  "/ops/credit",
  "/ops/feedback",
  "/ops/ideas",
  "/ops/leads",
  "/ops/outbox",
].map((path) => ({ path, role: "operator" }));

/** Runs in the page. Returns one line for every control that breaks a rule. */
function inspect(): Array<{ where: string; text: string; why: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  type Rgba = [number, number, number, number];
  const rgba = (colour: string): Rgba => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "rgba(0,0,0,0)";
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!, a! / 255];
  };
  const over = (top: Rgba, under: Rgba): Rgba => [
    top[0] * top[3] + under[0] * (1 - top[3]),
    top[1] * top[3] + under[1] * (1 - top[3]),
    top[2] * top[3] + under[2] * (1 - top[3]),
    1,
  ];
  const luminance = ([r, g, b]: Rgba) => {
    const [x, y, z] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
  };
  const contrast = (a: Rgba, b: Rgba) => {
    const [high, low] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (high! + 0.05) / (low! + 0.05);
  };
  /** The colours painted behind an element's text, or null when a picture is involved. */
  const behind = (element: Element): Rgba[] | null => {
    const layers: Array<{ fill: Rgba; stops: Rgba[] }> = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const image = style.backgroundImage;
      if (image.includes("url(")) return null;
      const stops = image.includes("gradient")
        ? (image.match(/(?:rgba?|oklch|oklab|color)\([^()]*\)/g) ?? []).map(rgba)
        : [];
      const fill = rgba(style.backgroundColor);
      layers.push({ fill, stops: stops.filter((stop) => stop[3] > 0.9) });
      if (fill[3] === 1 || stops.some((stop) => stop[3] > 0.9)) break;
    }
    let colours: Rgba[] = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) {
      colours = layer.stops.length ? layer.stops : colours.map((c) => over(layer.fill, c));
    }
    return colours;
  };
  const path = (element: Element) => {
    const parts: string[] = [];
    for (let node: Element | null = element; node && node !== document.body;) {
      const classes = [...node.classList].slice(0, 3).join(".");
      parts.unshift(node.tagName.toLowerCase() + (classes ? `.${classes}` : ""));
      if (parts.length === 3) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const verb =
    /^(save|send|publish|approve|reject|add|remove|redeem|stamp|spin|copy|download|continue|next|back|close|create|delete|cancel|pay|print|export)\b/i;
  const found: Array<{ where: string; text: string; why: string }> = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    'button, [role="button"], input[type="submit"], a',
  )) {
    const text = (element instanceof HTMLInputElement ? element.value : (element.innerText ?? ""))
      .replace(/\s+/g, " ")
      .trim();
    // A link that only opens another page may look like a link. Links dressed as buttons,
    // and links that do something without going anywhere, are checked.
    if (element.tagName === "A" && element.getAttribute("role") !== "button") {
      const dressed = element.matches(
        ".builder-primary, .builder-secondary, .pk-button, .row-action, .guest-back",
      );
      const href = element.getAttribute("href") ?? "";
      const acts = (href === "" || href === "#") && verb.test(text);
      if (!dressed && !acts) continue;
    }
    // The "More" item of the owner bottom bar is navigation and matches the links beside it.
    if (element.matches(".ox-tabs .ox-tab")) continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) continue;
    if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    if (element.closest('[aria-hidden="true"]')) continue;

    const fail = (why: string) =>
      found.push({ where: path(element), text: text.slice(0, 40), why });
    if (/^saved?(\.\.\.|!)?$/i.test(text) && text.toLowerCase() !== "save") {
      fail("label reads as a status");
    }
    if (/^saving/i.test(text)) fail("label reads as a status");

    // Icon only: no letters or digits to read. It needs a name and a square to press.
    if (!/[\p{L}\p{N}]/u.test(text)) {
      if (!element.getAttribute("aria-label")) fail("icon only button without aria-label");
      if (box.width < 43.5 || box.height < 43.5) {
        fail(`icon only button is ${Math.round(box.width)}x${Math.round(box.height)}, needs 44x44`);
      }
      continue;
    }

    const style = getComputedStyle(element);
    const filled = rgba(style.backgroundColor)[3] > 0.05 || style.backgroundImage !== "none";
    const bordered = (["Top", "Right", "Bottom", "Left"] as const).every(
      (side) =>
        parseFloat(style[`border${side}Width`]) >= 1 &&
        style[`border${side}Style`] !== "none" &&
        rgba(style[`border${side}Color`])[3] > 0.05,
    );
    if (!filled && !bordered) fail("no background and no border");

    const big = element.matches(
      ".builder-primary, .builder-secondary, .pk-button--primary, .pk-button--secondary",
    );
    const needed = big ? 44 : 32;
    if (box.height < needed - 0.5) fail(`height ${Math.round(box.height)}, needs ${needed}`);

    // A disabled control is faded on purpose (WCAG does not ask contrast of it).
    if (element.matches(":disabled, [aria-disabled='true']")) continue;
    // Check the colour of the element that holds the words, which may be a child.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement!;
      if (!/[\p{L}\p{N}]/u.test(node.textContent ?? "")) continue;
      if (!holder.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const backgrounds = behind(holder);
      if (!backgrounds) continue;
      const ink = rgba(getComputedStyle(holder).color);
      const worst = Math.min(...backgrounds.map((bg) => contrast(over(ink, bg), bg)));
      if (worst < 4.45) {
        fail(`text contrast ${worst.toFixed(2)}, needs 4.5`);
        break;
      }
    }
  }
  return found;
}

for (const [group, screens] of Object.entries({
  public: publicScreens,
  owner: ownerScreens,
  guest: guestScreens,
  till: tillScreens,
  operator: operatorScreens,
})) {
  test(`every button looks like a button: ${group} screens`, async ({ page }) => {
    test.setTimeout(600_000);
    const failures = new Map<string, string>();
    for (const screen of screens) {
      const name = screen.name ?? screen.path;
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.context().clearCookies();
      if (page.url() !== "about:blank") await page.evaluate(() => localStorage.clear());
      try {
        await open(page, screen);
      } catch (error) {
        failures.set(name, `${name}: did not open (${String(error).split("\n")[0]})`);
        continue;
      }
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        // Let colour transitions finish before reading them.
        await page.waitForTimeout(350);
        for (const item of await page.evaluate(inspect)) {
          const key = `${name}|${item.where}|${item.text}|${item.why}`;
          if (!failures.has(key)) {
            failures.set(key, `${name} @${width}: ${item.where} "${item.text}": ${item.why}`);
          }
        }
      }
    }
    if (process.env.LOOK_AUDIT_REPORT) {
      writeFileSync(
        `${process.env.LOOK_AUDIT_REPORT}-${group}.txt`,
        [...failures.values()].join("\n"),
      );
    }
    expect([...failures.values()]).toEqual([]);
  });
}

for (const width of [360, 1280]) {
  test(`one shared tab bar, no sideways scroll, at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const problems: string[] = [];
    for (const path of [
      "/app/loyalty",
      "/app/insights",
      "/app/customers",
      "/app/settings",
      "/app/team",
      "/app/locations",
      "/app/audit",
      "/app/feedback",
      "/app/ideas",
    ]) {
      await open(page, owner(path));
      const found = await page.evaluate(() => {
        const bars = [...document.querySelectorAll<HTMLElement>(".section-tabs")].filter((bar) =>
          bar.checkVisibility(),
        );
        const active = bars[0]?.querySelector<HTMLElement>(".section-tab.is-active");
        const box = active?.getBoundingClientRect();
        const bar = bars[0]?.getBoundingClientRect();
        return {
          bars: bars.length,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          activeShown:
            !!box &&
            !!bar &&
            box.left >= bar.left - 1 &&
            box.right <= bar.right + 1 &&
            box.top >= 0 &&
            box.bottom <= window.innerHeight,
          scrolled: window.scrollY,
        };
      });
      // Pages outside a tabbed section have no bar; the four named ones must have one.
      const required = ["/app/loyalty", "/app/insights", "/app/customers", "/app/settings"];
      if (found.bars > 1 || (required.includes(path) && found.bars !== 1)) {
        problems.push(`${path}: ${found.bars} tab bars`);
      }
      if (found.sideways > 1) problems.push(`${path}: page scrolls sideways by ${found.sideways}`);
      if (found.bars === 1 && (!found.activeShown || found.scrolled !== 0)) {
        problems.push(`${path}: the open tab is not in view`);
      }
    }
    expect(problems).toEqual([]);
  });
}

test("the demo till shows what to do after the PIN", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, { path: "/stamp", role: "staff", then: unlockTill });
  for (const name of ["Add a stamp", "Redeem a reward", "Redeem an offer code"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  for (const name of ["Look up", "Scan card", "Add stamp", "Redeem offer", "Sign out"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.mouse.wheel(0, 4000);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
});
