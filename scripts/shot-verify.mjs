// Temporary helper for the visual pass. Run with: node scripts/shot-verify.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE ?? "http://localhost:5173";
const targets = [
  { name: "owner-tools", role: "owner", venue: "daily-grind", path: "/app/loyalty" },
  { name: "guest-card", role: "guest", customer: "customer-1", path: "/r/daily-grind/card" },
  { name: "owner-reports", role: "owner", venue: "daily-grind", path: "/app/reports" },
  { name: "ops-leads", role: "operator", path: "/ops/leads" },
  { name: "ops-outbox", role: "operator", path: "/ops/outbox" },
  { name: "owner-campaigns", role: "owner", venue: "daily-grind", path: "/app/campaigns" },
  { name: "owner-customers", role: "owner", venue: "daily-grind", path: "/app/customers" },
  { name: "owner-settings", role: "owner", venue: "daily-grind", path: "/app/settings" },
  { name: "owner-qr", role: "owner", venue: "daily-grind", path: "/app/qr" },
  { name: "owner-page", role: "owner", venue: "daily-grind", path: "/app/page" },
  { name: "site-find", path: "/find" },
  { name: "site-contact", path: "/contact" },
  { name: "site-pricing", path: "/pricing" },
  { name: "site-home-help", path: "/" },
  { name: "site-suggest", path: "/suggest" },
  { name: "site-blog", path: "/blog" },
  { name: "site-blog-post", path: "/blog/why-the-card-still-works" },
  { name: "owner-ideas", role: "owner", venue: "daily-grind", path: "/app/ideas" },
  { name: "ops-ideas", role: "operator", path: "/ops/ideas" },
];

const browser = await chromium.launch();
const report = [];
for (const width of [375, 1280]) {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 200)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(String(message.text()).slice(0, 200));
    });
    let url = `${BASE}${target.path}`;
    if (target.role) {
      const params = new URLSearchParams({ role: target.role, to: target.path });
      if (target.venue) params.set("restaurant", target.venue);
      if (target.customer) params.set("customer", target.customer);
      url = `${BASE}/dev/roles?${params.toString()}`;
    }
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    if (target.role) {
      await page.waitForURL(`**${target.path}`, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1600);
    }
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
        innerWidth: window.innerWidth,
        wide,
        bodyText: document.body.innerText.slice(0, 120).replace(/\n/g, " | "),
      };
    });
    await page.screenshot({
      path: `screenshots/${target.name}-${width}.png`,
      fullPage: true,
    });
    report.push({ target: target.name, width, url: page.url(), ...metrics, errors: [...new Set(errors)].slice(0, 4) });
    await context.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
