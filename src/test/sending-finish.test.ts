// @vitest-environment node
// Checks that need no database for the finished sending work (D16b): the cron schedules match what
// the Worker is told to run, the cron and webhook routes refuse anyone without the secret, the push
// helpers behave, and the 0033 migration keeps the security rules written down.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CRON_ROUTES, cronRouteFor } from "@/lib/cron-schedule";
import { cronAuthorized } from "@/server/cron-auth";
import {
  guestPush,
  isStopReply,
  pushVerdict,
  stopConfirmation,
} from "@/lib/live-dispatch";
import { heldCostCents, reachFor } from "@/lib/live-campaigns";

describe("cron schedules", () => {
  it("wrangler.jsonc runs exactly the schedules the Worker knows how to answer", () => {
    const raw = readFileSync("wrangler.jsonc", "utf8");
    const noComments = raw.replace(/^\s*\/\/.*$/gm, "");
    const config = JSON.parse(noComments) as { main: string; env: { production: { triggers: { crons: string[] } } } };
    expect(config.main).toBe("src/server.ts");
    expect([...config.env.production.triggers.crons].sort()).toEqual(Object.keys(CRON_ROUTES).sort());
  });

  it("each schedule maps to one cron route, and an unknown schedule calls nothing", () => {
    expect(cronRouteFor("* * * * *")).toBe("/api/cron/dispatch");
    expect(cronRouteFor("*/10 * * * *")).toBe("/api/cron/settle");
    expect(cronRouteFor("0 6 * * *")).toBe("/api/cron/nightly");
    expect(cronRouteFor("1 1 1 1 1")).toBeNull();
  });
});

describe("cron secret", () => {
  const request = (secret?: string) =>
    new Request("https://x.test/api/cron/dispatch", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-cron-secret": secret },
    });

  it("refuses when the secret is missing, empty, wrong, or only almost right", () => {
    expect(cronAuthorized(request("anything"), {})).toBe(false);
    expect(cronAuthorized(request("anything"), { CRON_SECRET: "" })).toBe(false);
    expect(cronAuthorized(request(), { CRON_SECRET: "s3cret" })).toBe(false);
    expect(cronAuthorized(request("s3cret!"), { CRON_SECRET: "s3cret" })).toBe(false);
    expect(cronAuthorized(request("s3creu"), { CRON_SECRET: "s3cret" })).toBe(false);
  });

  it("accepts the exact secret", () => {
    expect(cronAuthorized(request("s3cret"), { CRON_SECRET: "s3cret" })).toBe(true);
  });
});

describe("cron and webhook routes", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  type Handler = (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>;
  const post = (route: unknown): Handler =>
    (route as { options: { server: { handlers: { POST: Handler } } } }).options.server.handlers.POST;

  for (const path of ["dispatch", "settle", "nightly"] as const) {
    it(`/api/cron/${path} refuses a caller without the secret and, with it, needs a database`, async () => {
      const routes = {
        dispatch: () => import("@/routes/api/cron/dispatch"),
        settle: () => import("@/routes/api/cron/settle"),
        nightly: () => import("@/routes/api/cron/nightly"),
      };
      const { Route } = await routes[path]();
      const call = (secret?: string) =>
        post(Route)({
          request: new Request(`https://x.test/api/cron/${path}`, {
            method: "POST",
            headers: secret ? { "x-cron-secret": secret } : {},
          }),
        });
      process.env["CRON_SECRET"] = "route-secret";
      delete process.env["DATABASE_URL"];
      expect((await call()).status).toBe(401);
      expect((await call("wrong")).status).toBe(401);
      // The right secret gets past the door and then stops because no database is set up here.
      expect((await call("route-secret")).status).toBe(503);
      delete process.env["CRON_SECRET"];
      expect((await call("route-secret")).status).toBe(401);
    });
  }

  it("the SMS webhook refuses delivery reports and STOP replies that do not carry our shared secret", async () => {
    const { Route } = await import("@/routes/api/webhooks/sms/$provider");
    process.env["BULKSMS_TOKEN_ID"] = "id";
    process.env["BULKSMS_TOKEN_SECRET"] = "secret";
    process.env["SMS_WEBHOOK_SECRET"] = "hook-secret";
    process.env["DATABASE_URL"] = "postgres://nobody@127.0.0.1:1/none";
    const body = JSON.stringify([{ id: "x1", status: { type: "DELIVERED" }, submission: { date: "2026-01-01T00:00:00Z" } }]);
    const call = (provider: string, query: string) =>
      post(Route)({
        request: new Request(`https://x.test/api/webhooks/sms/${provider}${query}`, { method: "POST", body }),
        params: { provider },
      });
    expect((await call("bulksms", "?kind=delivery")).status).toBe(403);
    expect((await call("bulksms", "?kind=delivery&secret=nope")).status).toBe(403);
    expect((await call("bulksms", "?kind=inbound&secret=hook-secre")).status).toBe(403);
    expect((await call("bulksms", "?kind=inbound")).status).toBe(403);
    expect((await call("other", "?secret=hook-secret")).status).toBe(404);
    delete process.env["SMS_WEBHOOK_SECRET"];
    // Without a configured secret nothing is accepted, not even an empty one.
    expect((await call("bulksms", "?kind=delivery&secret=")).status).toBe(403);
  });
});

describe("STOP words and the confirmation reply", () => {
  it("recognises opt-out words whatever the case, spacing or end punctuation", () => {
    for (const body of ["STOP", "stop", " Stop ", "stop.", "STOP!", "Stop All", "STOP ALL.", "stopall", "Unsubscribe", "cancel", "END", "quit"]) {
      expect(isStopReply(body), body).toBe(true);
    }
  });

  it("does not treat an ordinary reply as a STOP", () => {
    for (const body of ["Thanks!", "Please stop by tomorrow", "stopping", "", "yes", "Don't stop"]) {
      expect(isStopReply(body), body).toBe(false);
    }
  });

  it("the confirmation names the restaurant, never carries a STOP line, and survives a missing name", () => {
    expect(stopConfirmation("Smoke Cafe")).toBe("You are unsubscribed from Smoke Cafe. You will not get any more messages from them.");
    expect(stopConfirmation("  ")).toContain("this restaurant");
    expect(stopConfirmation("Smoke Cafe")).not.toMatch(/reply stop/i);
  });
});

describe("push helpers", () => {
  it("a push is delivered if any device took it, retried if one asked, failed when none can", () => {
    expect(pushVerdict(["gone", "delivered"])).toBe("delivered");
    expect(pushVerdict(["retry", "delivered"])).toBe("delivered");
    expect(pushVerdict(["gone", "retry"])).toBe("retry");
    expect(pushVerdict(["gone", "failed"])).toBe("failed");
    expect(pushVerdict(["gone"])).toBe("failed");
    expect(pushVerdict([])).toBe("failed");
  });

  it("builds what the guest sees: restaurant on top, the offer filled in, a tap opens their card", () => {
    expect(guestPush("Hi {first_name}, a free coffee.", "Thandi Nkosi", "Smoke Cafe", "smoke-cafe")).toEqual({
      title: "Smoke Cafe",
      body: "Hi Thandi, a free coffee.",
      url: "/r/smoke-cafe",
    });
    expect(guestPush("Hi {first_name}, hello.", "", "  ", "x").title).toBe("Patron");
  });

  it("push reaches its own count, Both reaches either, and only text costs credit", () => {
    const counts = { sms: 10, push: 4, either: 12 };
    expect(reachFor("sms", counts)).toBe(10);
    expect(reachFor("push", counts)).toBe(4);
    expect(reachFor("both", counts)).toBe(12);
    expect(heldCostCents("push", counts, 2)).toBe(0);
    expect(heldCostCents("sms", counts, 2)).toBe(10 * 2 * 35);
    expect(heldCostCents("both", counts, 1)).toBe(10 * 35);
  });
});

describe("migration 0033", () => {
  const text = readFileSync("db/migrations/0033_sending_finish_dev.sql", "utf8");
  const bodies = text.split(/create or replace function /).slice(1);

  it("every function is a security definer with a fixed search_path", () => {
    expect(bodies.length).toBeGreaterThanOrEqual(15);
    for (const body of bodies) {
      expect(body, body.slice(0, 50)).toMatch(/security definer set search_path = public, pg_temp/);
    }
  });

  it("every function is revoked from public, and the dispatcher's functions check for the operator", () => {
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf("(")).trim();
      expect(text, name).toMatch(new RegExp(`revoke all on function ${name}\\(`));
    }
    for (const name of [
      "queue_campaign_messages", "claim_queued_push", "finish_push_send", "fail_push_send",
      "disable_push_subscription", "settle_campaign", "hold_receipt", "finish_message_send",
      "stop_reply_for", "run_nightly_maintenance",
    ]) {
      const body = bodies.find((candidate) => candidate.startsWith(`${name}(`))!;
      expect(body, name).toContain("app_is_operator()");
    }
  });

  it("helpers that only other functions call are never granted to the app login", () => {
    for (const name of ["queue_sms_fallback", "end_push_message", "campaign_audience_ids"]) {
      expect(text).not.toMatch(new RegExp(`grant execute on function ${name}\\(`));
    }
  });

  it("the held receipts table is closed to the app login", () => {
    expect(text).toContain("alter table pending_receipt force row level security");
    expect(text).not.toMatch(/grant [a-z, ]+ on (table )?pending_receipt/);
  });

  it("the owner's recipient count only counts the caller's own restaurant", () => {
    const body = bodies.find((candidate) => candidate.startsWith("count_campaign_recipients("))!;
    expect(body).toContain("app_restaurant() is distinct from p_restaurant");
  });
});
