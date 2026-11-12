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
    // The only writes to restaurant plan come from the trigger's read side, never a caller argument.
    expect(sql).not.toMatch(/p_role\b/);
    expect(sql).not.toMatch(/p_plan\b/);
    expect(sql).not.toMatch(/p_credit/i);
  });

  it("keeps the location limit trigger on the location table", () => {
    expect(sql).toMatch(/create trigger location_limit_guard/);
    expect(sql).toMatch(/before insert on location/);
  });

  it("does not apply itself: the header says it is not applied", () => {
    expect(sql.slice(0, 400)).toMatch(/NOT APPLIED/);
  });
});
