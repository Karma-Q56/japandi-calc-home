// Visual pass helper. Run with: SHOT_BASE=http://localhost:5173 node scripts/shot-verify.mjs
// Signs in with /dev/roles?role=...&to=..., screenshots each stage at 375px and
// 1280px, and writes .shot-report.json with overflow, title, url and console
// errors per shot. Click stages use real button and field labels so the walk
// exercises the same steps an owner or staff member touches.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Full-page shots must show the page, not the demo furniture. The demo pill and
// the fixed bottom bars are pinned to the window, so in a full-page capture they
// land in the middle of the image and cover real content. They are hidden for
// the shot only, and tall pages are also cut into pieces of at most 1500px so
// every band can be opened and looked at.

const BASE = process.env.SHOT_BASE ?? "http://localhost:5173";

const groups = [
  // --- Owner restaurant daily-grind ---
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app",
    stages: [{ name: "owner-dashboard" }],
  },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/customers/customer-1",
    stages: [{ name: "owner-customer" }],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/insights", stages: [{ name: "owner-insights" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/customers", stages: [{ name: "owner-customers" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/lists", stages: [{ name: "owner-lists" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/reports", stages: [{ name: "owner-reports" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/menu", stages: [{ name: "owner-menu" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/menu",
    stages: [
      {
        name: "owner-menu-preview",
        acts: [{ click: "Edit" }, { click: "Preview item" }],
      },
    ],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/specials", stages: [{ name: "owner-specials" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/loyalty", stages: [{ name: "owner-loyalty" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/loyalty",
    stages: [{ name: "owner-loyalty-preview", acts: [{ click: "Preview changes" }] }],
  },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/loyalty",
    stages: [{ name: "owner-loyalty-tools", acts: [{ click: "Loyalty tools" }] }],
  },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/loyalty",
    stages: [{ name: "owner-loyalty-wheel", acts: [{ click: "Spin wheel" }] }],
  },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/loyalty",
    stages: [{ name: "owner-loyalty-tiers", acts: [{ click: "Tiers and challenges" }] }],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/design", stages: [{ name: "owner-design" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/design",
    stages: [{ name: "owner-design-preview", acts: [{ click: "Preview my card" }] }],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/challenges", stages: [{ name: "owner-challenges" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/challenges",
    stages: [
      {
        name: "owner-challenges-preview",
        acts: [
          { fill: ['input[placeholder="Three visits in 14 days"]', "Three visits in 14 days"] },
          { fill: ['section.builder-panel input[type=number] >> nth=0', "3"] },
          { fill: ['section.builder-panel input[type=number] >> nth=1', "14"] },
          { fill: ['section.builder-panel input[type=number] >> nth=2', "1"] },
          { click: "Preview this challenge" },
        ],
      },
    ],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/campaigns", stages: [{ name: "owner-campaigns" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/campaigns/new", stages: [{ name: "owner-campaign-new" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/campaigns/campaign-1",
    stages: [{ name: "owner-campaign-results" }],
  },
  { role: "owner", venue: "rest-daily-grind", path: "/app/credit", stages: [{ name: "owner-credit" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/team", stages: [{ name: "owner-team" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/qr", stages: [{ name: "owner-qr" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/settings", stages: [{ name: "owner-settings" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/onboarding", stages: [{ name: "owner-onboarding" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/audit", stages: [{ name: "owner-audit" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/ideas", stages: [{ name: "owner-ideas" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/feedback", stages: [{ name: "owner-feedback" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/page", stages: [{ name: "owner-page" }] },
  { role: "owner", venue: "rest-daily-grind", path: "/app/referrals", stages: [{ name: "owner-referrals-draft" }] },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/referrals",
    stages: [{ name: "owner-referrals-preview", acts: [{ click: "Continue" }] }],
  },
  {
    role: "owner",
    venue: "rest-daily-grind",
    path: "/app/referrals",
    stages: [
      {
        name: "owner-referrals-publish",
        acts: [{ click: "Continue" }, { click: "Review and publish" }],
      },
    ],
  },
  // --- Staff till, item mode at daily-grind and category mode at oak-table ---
  {
    role: "staff",
    venue: "rest-daily-grind",
    path: "/stamp",
    stages: [
      { name: "till-pair" },
      { name: "till-sign-in", acts: [{ click: "Pair this device as a till (demo shortcut)" }] },
      {
        name: "till-order-items",
        acts: [
          { click: "Pair this device as a till (demo shortcut)" },
          { select: ["select", "Mia"] },
          { fill: [".pin-input", "1234"] },
          { click: "Unlock till" },
          { fill: ['input[placeholder*="PT"]', "+27825550102"] },
          { click: "Look up" },
          { click: "Add stamp" },
        ],
      },
    ],
  },
  {
    role: "staff",
    venue: "rest-sunrise-bakes",
    path: "/stamp",
    stages: [
      {
        name: "till-order-categories",
        acts: [
          { click: "Pair this device as a till (demo shortcut)" },
          { select: ["select", "Thabo"] },
          { fill: [".pin-input", "2345"] },
          { click: "Unlock till" },
          { fill: ['input[placeholder*="PT"]', "+27825550121"] },
          { click: "Look up" },
          { click: "Add stamp" },
        ],
      },
    ],
  },
  // --- Guest ---
  {
    role: "guest",
    customer: "customer-1",
    path: "/r/daily-grind/card",
    stages: [{ name: "guest-card" }],
  },
  {
    path: "/r/daily-grind/join?ref=PALTUMEL2&src=friend_referral",
    stages: [
      { name: "join-referral" },
      {
        name: "join-birthday",
        acts: [
          { click: "Join The Daily Grind" },
          { select: [".join-birthday-row select >> nth=0", "12"] },
          { select: [".join-birthday-row select >> nth=1", "March"] },
        ],
      },
    ],
  },
  {
    role: "guest",
    customer: "customer-1",
    path: "/me",
    stages: [
      { name: "me-home" },
      { name: "me-restaurants", acts: [{ click: "Restaurants" }] },
      { name: "me-settings", acts: [{ click: "Restaurants" }, { click: "Me" }] },
    ],
  },
  // --- Operator ---
  { role: "operator", path: "/ops/restaurants", stages: [{ name: "ops-restaurants" }] },
  { role: "operator", path: "/ops/restaurants/rest-daily-grind", stages: [{ name: "ops-restaurant" }] },
  { role: "operator", path: "/ops/restaurants/rest-daily-grind/look", stages: [{ name: "ops-look" }] },
  { role: "operator", path: "/ops/credit", stages: [{ name: "ops-credit" }] },
  { role: "operator", path: "/ops/leads", stages: [{ name: "ops-leads" }] },
  { role: "operator", path: "/ops/outbox", stages: [{ name: "ops-outbox" }] },
  { role: "operator", path: "/ops/ideas", stages: [{ name: "ops-ideas" }] },
  { role: "operator", path: "/ops/feedback", stages: [{ name: "ops-feedback" }] },
  // --- Marketing ---
  { path: "/", stages: [{ name: "site-home-help" }] },
  { path: "/pricing", stages: [{ name: "site-pricing" }] },
  { path: "/how-it-works", stages: [{ name: "site-how-it-works" }] },
  { path: "/faq", stages: [{ name: "site-faq" }] },
  { path: "/contact", stages: [{ name: "site-contact" }] },
  { path: "/for-business", stages: [{ name: "site-for-business" }] },
  { path: "/for-diners", stages: [{ name: "site-for-diners" }] },
  { path: "/find", stages: [{ name: "site-find" }] },
  { path: "/privacy", stages: [{ name: "site-privacy" }] },
  { path: "/terms", stages: [{ name: "site-terms" }] },
  { path: "/login", stages: [{ name: "site-login" }] },
  { path: "/blog", stages: [{ name: "site-blog" }] },
  { path: "/blog/why-the-card-still-works", stages: [{ name: "site-blog-post" }] },
  { path: "/suggest", stages: [{ name: "site-suggest" }] },
  { path: "/feedback", stages: [{ name: "site-feedback" }] },
  { path: "/dev/kit", stages: [{ name: "dev-kit" }] },
];

const report = [];
let stageCount = 0;
const widths = (process.env.SHOT_WIDTHS ?? "375,1280")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => value > 0);
const only = process.env.SHOT_ONLY ?? "";
const browser = await chromium.launch();
for (const width of widths) {
  for (const group of groups.filter((group) =>
    only
      ? group.stages.some((stage) => stage.name.startsWith(only))
      : true,
  )) {
    const active = only ? group.stages.filter((stage) => stage.name.startsWith(only)) : group.stages;
    const context = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    for (const stage of active) {
      stageCount += 1;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 200)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(String(message.text()).slice(0, 200));
      });
      let url = `${BASE}${group.path}`;
      if (group.role) {
        const params = new URLSearchParams({ role: group.role, to: group.path.split("?")[0] });
        if (group.venue) params.set("restaurant", group.venue);
        if (group.customer) params.set("customer", group.customer);
        url = `${BASE}/dev/roles?${params.toString()}`;
      }
      try {
        await page.goto(url, { waitUntil: "load", timeout: 30000 });
      } catch {
        report.push({ target: stage.name, width, fatal: "goto failed" });
        await page.close();
        continue;
      }
      await page.waitForTimeout(1200);
      if (group.role) {
        await page.waitForURL(`**${group.path.split("?")[0]}`, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1600);
      }
      const problems = [];
      for (const act of stage.acts ?? []) {
        try {
          if ("click" in act) {
            const button = page.getByRole("button", { name: act.click, exact: true });
            const link = page.getByRole("link", { name: act.click, exact: true });
            if (await button.count()) await button.first().click({ timeout: 6000 });
            else if (await link.count()) await link.first().click({ timeout: 6000 });
            else await page.getByText(act.click, { exact: true }).first().click({ timeout: 6000 });
          } else if ("fill" in act) {
            await page.locator(act.fill[0]).first().fill(act.fill[1]);
          } else if ("select" in act) {
            await page.locator(act.select[0]).selectOption({ label: act.select[1] });
          } else if ("press" in act) {
            await page.keyboard.press(act.press);
          }
          await page.waitForTimeout(500);
        } catch (error) {
          problems.push(`${JSON.stringify(act)}: ${String(error).slice(0, 120)}`);
        }
      }
      await page.waitForTimeout(700);
      // A click can still be finishing a navigation; wait for it before touching
      // the page, otherwise addStyleTag throws and the whole run stops.
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      // Walk the page so IntersectionObserver reveal sections become visible
      // before the full-page capture, then return to the top.
      await page.evaluate(async () => {
        const step = Math.max(240, Math.floor(window.innerHeight * 0.7));
        const height = document.documentElement.scrollHeight;
        for (let y = 0; y < height; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
        window.scrollTo(0, 0);
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
      // Hide the demo pill and every fixed bar that would float over the page.
      await page
        .addStyleTag({
          content:
            ".demo-control,.demo-control-panel,.gx-tabs,.owner-bottom,.ox-bottom,.till-bar,.till-actions-bar,[data-shot-hide]{display:none !important}",
        })
        .catch(() => {});
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("body *")) {
          const style = getComputedStyle(el);
          if (style.position !== "fixed" && style.position !== "sticky") continue;
          const rect = el.getBoundingClientRect();
          if (rect.height > 0 && rect.top > window.innerHeight / 2) {
            el.setAttribute("data-shot-hide", "");
          }
        }
      });
      await page.waitForTimeout(200);
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
        return {
          title: document.title,
          scrollWidth: doc.scrollWidth,
          scrollHeight: doc.scrollHeight,
          innerWidth: window.innerWidth,
          wide,
          bodyText: document.body.innerText.slice(0, 140).replace(/\n/g, " | "),
        };
      }).catch(() => ({
        title: "",
        scrollWidth: 0,
        scrollHeight: 0,
        innerWidth: width,
        wide: [],
        bodyText: "",
      }));
      await page
        .screenshot({
          path: `screenshots/${stage.name}-${width}.png`,
          fullPage: true,
        })
        .catch((error) => problems.push(`screenshot: ${String(error).slice(0, 100)}`));
      // Pages taller than 1500px are also saved as pieces of at most 1500px.
      const pageHeight = metrics.scrollHeight;
      const pieceCount = pageHeight > 1500 ? Math.ceil(pageHeight / 1500) : 0;
      if (pieceCount > 0) {
        mkdirSync("screenshots/pieces", { recursive: true });
        try {
          const client = await context.newCDPSession(page);
          for (let index = 0; index < pieceCount; index += 1) {
            const y = index * 1500;
            const height = Math.min(1500, pageHeight - y);
            const shot = await client.send("Page.captureScreenshot", {
              format: "png",
              captureBeyondViewport: true,
              clip: { x: 0, y, width, height, scale: 1 },
            });
            writeFileSync(
              `screenshots/pieces/${stage.name}-${width}-p${String(index + 1).padStart(2, "0")}.png`,
              Buffer.from(shot.data, "base64"),
            );
          }
          await client.detach();
        } catch (error) {
          problems.push(`pieces: ${String(error).slice(0, 100)}`);
        }
      }
      report.push({
        target: stage.name,
        width,
        url: page.url(),
        pageHeight,
        pieces: pieceCount,
        ...metrics,
        problems: problems.length ? problems : undefined,
        errors: [...new Set(errors)].slice(0, 4),
      });
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(process.env.SHOT_REPORT ?? ".shot-report.json", JSON.stringify(report, null, 1));
const flagged = report.filter(
  (entry) =>
    (entry.wide && entry.wide.length > 0) ||
    (entry.errors && entry.errors.length > 0) ||
    (entry.problems && entry.problems.length > 0) ||
    entry.fatal,
);
console.log(`Stages: ${stageCount}, shots: ${report.length}, flagged: ${flagged.length}`);
for (const entry of flagged) {
  console.log(
    JSON.stringify({
      target: entry.target,
      width: entry.width,
      wide: entry.wide,
      errors: entry.errors,
      problems: entry.problems,
      fatal: entry.fatal,
    }),
  );
}
