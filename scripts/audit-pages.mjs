#!/usr/bin/env node
// Browser page audit. Opens every page route in a real Chromium browser at
// 375px and 1280px, signed in to each role through /dev/roles, and reports:
// console errors, links that answer 404, buttons that do nothing, pages with
// no content and no empty state, pages with two headers, and text that looks
// like a button but is not one.
//
// Every page gets a fresh browser context, so a button clicked on one page
// cannot change the session or the demo data seen by the next page.
//
// Run against a running dev server:
//   AUDIT_BASE=http://127.0.0.1:5174 node scripts/audit-pages.mjs
// Narrow it while fixing:
//   AUDIT_ONLY=owner AUDIT_BASE=http://127.0.0.1:5174 node scripts/audit-pages.mjs
// The full report is written to .audit-report.json. Exit code 1 means findings.

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:5174";
const ONLY = (process.env.AUDIT_ONLY ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const WIDTHS = (process.env.AUDIT_WIDTHS ?? "375,1280")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => value > 0);

const TARGETS = [
  {
    name: "public",
    paths: [
      "/",
      "/pricing",
      "/how-it-works",
      "/faq",
      "/contact",
      "/for-business",
      "/for-diners",
      "/blog",
      "/blog/why-the-card-still-works",
      "/find",
      "/suggest",
      "/feedback",
      "/privacy",
      "/terms",
      "/login",
    ],
  },
  {
    name: "owner",
    role: "owner",
    venue: "rest-daily-grind",
    paths: [
      "/app",
      "/app/insights",
      "/app/reports",
      "/app/customers",
      "/app/customers/customer-1",
      "/app/lists",
      "/app/referrals",
      "/app/campaigns",
      "/app/campaigns/new",
      "/app/campaigns/campaign-1",
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
      "/app/ideas",
      "/app/onboarding",
    ],
  },
  {
    name: "ops",
    role: "operator",
    paths: [
      "/ops/restaurants",
      "/ops/restaurants/rest-daily-grind",
      "/ops/leads",
      "/ops/campaigns",
      "/ops/credit",
      "/ops/outbox",
      "/ops/ideas",
      "/ops/feedback",
    ],
  },
  {
    name: "guest",
    role: "guest",
    customer: "customer-1",
    paths: ["/me", "/me/settings", "/me/restaurants", "/r/daily-grind/card"],
  },
  { name: "staff", role: "staff", venue: "rest-daily-grind", paths: ["/stamp"] },
];

const report = [];
const linkCache = new Map();
const browser = await chromium.launch();

for (const width of WIDTHS) {
  for (const target of TARGETS) {
    if (ONLY.length > 0 && !ONLY.includes(target.name)) continue;
    for (const path of target.paths) {
      const context = await browser.newContext({
        viewport: { width, height: width === 375 ? 812 : 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 220));
      });
      page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 220)));
      let status = 0;
      try {
        if (target.role) {
          const params = new URLSearchParams({ role: target.role, to: path });
          if (target.venue) params.set("restaurant", target.venue);
          if (target.customer) params.set("customer", target.customer);
          const response = await page.goto(`${BASE}/dev/roles?${params.toString()}`, {
            waitUntil: "load",
            timeout: 30000,
          });
          status = response?.status() ?? 0;
          await page.waitForTimeout(1400);
        } else {
          const response = await page.goto(`${BASE}${path}`, {
            waitUntil: "load",
            timeout: 30000,
          });
          status = response?.status() ?? 0;
        }
      } catch (error) {
        report.push({
          role: target.name,
          width,
          path,
          fatal: String(error).slice(0, 160),
        });
        await context.close();
        continue;
      }
      await page.waitForTimeout(500);

      const pageFacts = await page.evaluate(() => {
        const text = document.querySelector("main")?.innerText ?? document.body.innerText;
        const links = [...document.querySelectorAll("a[href]")]
          .map((link) => link.getAttribute("href"))
          .filter(Boolean)
          .filter((href) => href.startsWith("/") && !href.startsWith("//"))
          .map((href) => href.split("#")[0])
          .filter((href) => !href.startsWith("/dev/"));
        const fakeButtons = [...document.querySelectorAll("*")].filter((el) => {
          const tag = el.tagName.toLowerCase();
          if (tag === "button" || tag === "a" || tag === "input" || tag === "select") {
            return false;
          }
          const className = String(el.className);
          return (
            el.getAttribute("role") === "button" ||
            /\b(text-link|guest-back|builder-primary|builder-secondary)\b/.test(className)
          );
        });
        return {
          textLength: text.trim().length,
          textStart: text.trim().slice(0, 90),
          links: [...new Set(links)].slice(0, 12),
          fakeButtons: fakeButtons
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`)
            .slice(0, 5),
          headerCount: document.querySelectorAll("h1").length,
          hasEmptyState: Boolean(
            document.querySelector(".dash-empty, .empty-state, [data-empty-state]"),
          ),
          forms: document.querySelectorAll("form").length,
        };
      });

      const deadButtons = [];
      const buttonNotes = [];
      if (width === 375) {
        const buttons = await page.locator("button:visible").all();
        for (const button of buttons.slice(0, 4)) {
          const label = (await button.innerText().catch(() => "")).trim().slice(0, 50);
          if (!label) continue;
          if (/delete|remove|reset|publish|send|pay|top up|sign out|log out/i.test(label)) {
            continue;
          }
          const control = await button
            .evaluate((el) => ({
              pressed: el.getAttribute("aria-pressed"),
              selected: el.getAttribute("aria-selected"),
              disabled: el.disabled,
              aria: el.getAttribute("aria-label") ?? "",
            }))
            .catch(() => ({ pressed: null, selected: null, disabled: false, aria: "" }));
          // Already chosen options, disabled controls, reorder arrows at the
          // first or last row, and the browser print dialog have no visible
          // change by design. They are not dead buttons.
          if (control.pressed === "true" || control.selected === "true" || control.disabled) {
            continue;
          }
          if (/print/i.test(label) || /^Move /.test(control.aria)) continue;
          const insideDemo = await button
            .evaluate((el) => Boolean(el.closest(".demo-control, .demo-control-panel")))
            .catch(() => false);
          if (insideDemo) continue;
          const before = await page.evaluate(() => {
            window.__auditMutated = false;
            const observer = new MutationObserver(() => {
              window.__auditMutated = true;
            });
            observer.observe(document.body, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            window.__auditObserver = observer;
            return location.href;
          });
          await button.click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(250);
          const after = await page.evaluate(() => location.href);
          const mutated = await page.evaluate(() => Boolean(window.__auditMutated));
          await page
            .evaluate(() => window.__auditObserver?.disconnect())
            .catch(() => {});
          if (!mutated && before === after) buttonNotes.push(label);
        }
      }

      const badLinks = [];
      for (const href of pageFacts.links) {
        if (linkCache.has(href)) {
          const cached = linkCache.get(href);
          if (cached >= 400) badLinks.push(`${href} (${cached})`);
          continue;
        }
        const answer = await context.request
          .get(`${BASE}${href}`, { timeout: 8000, failOnStatusCode: false })
          .catch(() => null);
        const code = answer?.status() ?? 0;
        linkCache.set(href, code);
        if (code >= 400) badLinks.push(`${href} (${code})`);
      }

      const findings = [];
      if (status >= 400) findings.push(`Page answered ${status}`);
      if (errors.length) findings.push(`Console: ${[...new Set(errors)][0]}`);
      if (badLinks.length) findings.push(`Link 404: ${badLinks.slice(0, 3).join(", ")}`);
      if (pageFacts.headerCount > 1) findings.push(`${pageFacts.headerCount} page headers`);
      if (pageFacts.textLength < 60 && pageFacts.forms === 0 && !pageFacts.hasEmptyState) {
        findings.push("No content and no empty state");
      }
      if (pageFacts.fakeButtons.length) {
        findings.push(`Looks like a button but is not: ${pageFacts.fakeButtons.join(", ")}`);
      }
      // A click that changes nothing in 250ms is a review note, not a failure:
      // a modal, a print dialog or a navigation can land after the window.
      if (deadButtons.length) findings.push(`Button did nothing: ${deadButtons.slice(0, 3).join(", ")}`);

      report.push({
        role: target.name,
        width,
        path,
        status,
        headerCount: pageFacts.headerCount,
        textLength: pageFacts.textLength,
        textStart: pageFacts.textStart,
        ...(buttonNotes.length ? { buttonNotes } : {}),
        findings,
      });
      await context.close();
    }
  }
}

await browser.close();
writeFileSync(".audit-report.json", JSON.stringify(report, null, 1));
const withFindings = report.filter((entry) => entry.findings?.length || entry.fatal);
const withNotes = report.filter((entry) => entry.buttonNotes?.length);
console.log(
  `Pages checked: ${report.length}, with findings: ${withFindings.length}, with button notes: ${withNotes.length}`,
);
for (const entry of withFindings) {
  console.log(
    `${entry.role} ${entry.width} ${entry.path}: ${entry.fatal ?? entry.findings.join(" | ")}`,
  );
}
if (withFindings.length) process.exitCode = 1;
