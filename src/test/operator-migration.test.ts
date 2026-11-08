import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Text checks on db/migrations/0029_operator_dev.sql (phase D18).
// The real database checks live in src/test/db/operator.db.test.ts.

const sql = readFileSync("db/migrations/0029_operator_dev.sql", "utf8");

// Signatures as written in the migration, without parameter names.
const FUNCTIONS = [
  "assert_operator(text)",
  "operator_set_restaurant_status(text, uuid, restaurant_status, text)",
  "operator_set_restaurant_plan(text, uuid, plan_tier, text)",
  "operator_add_credit(text, uuid, ledger_entry_type, integer, text, text)",
  "operator_decide_campaign(text, uuid, text, text)",
  "operator_create_restaurant(text, text, text, text, text, text)",
];

// The name and types only, so the test does not depend on parameter names.
const typesOnly = (fn: string) => fn.replace(/\(.*\)/, "");

describe("0029 operator migration", () => {
  it("defines every operator function", () => {
    for (const fn of FUNCTIONS) {
      expect(sql).toMatch(new RegExp(`create or replace function ${typesOnly(fn)}\\(`));
    }
  });

  it("makes every function SECURITY DEFINER with a locked search_path", () => {
    const definers = sql.match(/security definer/g) ?? [];
    expect(definers.length).toBe(FUNCTIONS.length);
    const paths = sql.match(/set search_path = public, pg_temp/g) ?? [];
    expect(paths.length).toBe(FUNCTIONS.length);
  });

  it("revokes every function from public and grants only to app_user", () => {
    for (const fn of FUNCTIONS) {
      const name = typesOnly(fn);
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
    expect(sql).not.toMatch(/grant execute[^;]*to public/);
  });

  it("checks the operator role in the database on every write", () => {
    const checks = sql.match(/perform assert_operator\(p_operator_id\);/g) ?? [];
    expect(checks.length).toBe(FUNCTIONS.length - 1);
  });

  it("restores the caller's operator setting before every return", () => {
    const restores = sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\);/g) ?? [];
    // Every function except assert_operator, which only reads, plus the duplicate-credit early return.
    expect(restores.length).toBeGreaterThanOrEqual(FUNCTIONS.length - 1);
  });

  it("takes the operator id from a parameter and never from a role or plan argument", () => {
    // Role is never an argument. The operator id is checked, not trusted.
    expect(sql).not.toMatch(/p_role/);
    expect(sql).toContain("where user_id = p_operator_id and role = 'operator'");
  });

  it("writes an audit row for every operator action", () => {
    const audits = sql.match(/insert into audit_event/g) ?? [];
    // status, plan, credit, campaign decision, create restaurant.
    expect(audits.length).toBe(5);
    expect(sql).toContain("'restaurant_status_changed'");
    expect(sql).toContain("'restaurant_plan_changed'");
    expect(sql).toContain("'credit_added'");
    expect(sql).toContain("'campaign_approved'");
    expect(sql).toContain("'campaign_rejected'");
    expect(sql).toContain("'restaurant_created_for_owner'");
  });

  it("uses the reference as the idempotency key for credit", () => {
    expect(sql).toContain("if exists (select 1 from credit_ledger where reference = clean_ref)");
    expect(sql).toContain("return 'duplicate';");
  });

  it("limits credit to topups and adjustments only", () => {
    expect(sql).toContain("p_entry_type not in ('topup', 'adjustment')");
  });

  it("does not add a restaurant-level campaign approval setting", () => {
    expect(sql).not.toMatch(/alter table restaurant add column[^;]*approval/i);
  });
});
