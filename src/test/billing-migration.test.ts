import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text checks on migration 0032 (D21 plans, billing and payments).
const sql = readFileSync("db/migrations/0032_billing_dev.sql", "utf8");

describe("migration 0032 (plans, billing and payments)", () => {
  it("marks every SECURITY DEFINER function with a fixed search_path", () => {
    const definers = sql.match(/^security definer$/gm) ?? [];
    const paths = sql.match(/^set search_path = public, pg_temp$/gm) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(paths.length).toBe(definers.length);
  });

  it("revokes every new function from public and grants it only to app_user", () => {
    const functions = [
      "location_limit",
      "create_card_payment",
      "settle_card_payment",
      "operator_create_invoice",
      "operator_mark_invoice_paid",
    ];
    for (const name of functions) {
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
    }
    for (const name of functions.filter((n) => n !== "location_limit")) {
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
  });

  it("never lets a caller set a role, a plan or a credit amount directly", () => {
    // A monthly payment names its plan, but the restaurant's plan only changes inside settle_card_payment,
    // from the stored payment row (p.plan), never straight from a caller argument.
    expect(sql).not.toMatch(/p_role\b/);
    expect(sql).not.toMatch(/set plan = p_plan/);
    expect(sql.match(/update restaurant set plan = /g)?.length).toBe(1);
    expect(sql).not.toMatch(/p_credit/i);
  });

  it("keeps the location limit trigger on the location table", () => {
    expect(sql).toMatch(/create trigger location_limit_guard/);
    expect(sql).toMatch(/before insert on location/);
  });

  it("settles payments only without a restaurant or guest context", () => {
    const body = sql.slice(sql.indexOf("create or replace function settle_card_payment"));
    const guard = body.indexOf("app_restaurant() is not null or app_customer() is not null");
    const operatorOn = body.indexOf("set_config('app.is_operator', 'true', true)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(operatorOn);
    expect(body.slice(guard, guard + 200)).toMatch(/raise exception 'not_allowed'/);
  });

  it("gives the app role read access to invoices and nothing more", () => {
    expect(sql).toMatch(/grant select on invoice to app_user;/);
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* on invoice/i);
  });

  it("blocks a second monthly payment and names the plan on a monthly payment", () => {
    expect(sql).toMatch(/raise exception 'subscription_exists'/);
    expect(sql).toMatch(/alter table payment add column plan plan_tier;/);
    expect(sql).toMatch(/update restaurant set plan = p\.plan/);
  });

  it("does not apply itself: the header says it is not applied", () => {
    expect(sql.slice(0, 400)).toMatch(/NOT APPLIED/);
  });
});
