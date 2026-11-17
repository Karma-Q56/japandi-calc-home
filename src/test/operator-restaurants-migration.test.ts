import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text checks on migration 0036 (D23 operator restaurants, top ups, invoices and refunds).
const sql = readFileSync("db/migrations/0036_operator_restaurants_dev.sql", "utf8");

const functions = [
  "operator_list_restaurants",
  "operator_restaurant_detail",
  "operator_pending_topups",
  "operator_list_invoices",
  "operator_confirm_topup",
  "operator_reject_topup",
  "operator_void_invoice",
  "operator_record_refund",
];

describe("migration 0036 (operator restaurants, top ups, invoices and refunds)", () => {
  it("marks every SECURITY DEFINER function with a fixed search_path", () => {
    const definers = sql.match(/^security definer$/gm) ?? [];
    const paths = sql.match(/^set search_path = public, pg_temp$/gm) ?? [];
    expect(definers.length).toBe(functions.length);
    expect(paths.length).toBe(definers.length);
  });

  it("revokes every new function from public and grants it only to app_user", () => {
    for (const name of functions) {
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
  });

  it("enables and forces row level security on the refund table", () => {
    expect(sql).toMatch(/alter table refund enable row level security;/);
    expect(sql).toMatch(/alter table refund force row level security;/);
  });

  it("gives the app role no direct grants on the refund table", () => {
    expect(sql).toMatch(/revoke all on refund from public;/);
    expect(sql).not.toMatch(/grant [^;]*\bon refund\b/i);
  });

  it("never lets a caller set a role or a plan directly", () => {
    // p_status is allowed only as a read filter in the list functions, never as a write value.
    expect(sql).not.toMatch(/p_role\b/);
    expect(sql).not.toMatch(/p_plan\b/);
    const writes = sql.slice(sql.indexOf("create or replace function operator_confirm_topup"));
    expect(writes).not.toMatch(/p_status\b/);
  });

  it("writes refunds as negative adjustment ledger rows", () => {
    expect(sql).toMatch(/'adjustment'/);
    expect(sql).toMatch(/'refund:'/);
  });
});
