import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Text checks on db/migrations/0022_owner_admin_dev.sql (phase D13a).
// The real database checks live in src/test/db/owner-admin.db.test.ts.

const sql = readFileSync("db/migrations/0022_owner_admin_dev.sql", "utf8");

// Signatures as written in the migration, without parameter names.
const FUNCTIONS = [
  "owner_restaurant_for_user(text)",
  "save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer)",
  "send_owner_feedback(text, text, text, text)",
  "list_owner_feedback(text)",
  "submit_owner_idea(text, text, text)",
  "list_owner_ideas(text)",
  "list_owner_activity(text, timestamptz)",
  "set_owner_help(text, boolean, integer)",
  "request_owner_campaign(text, text)",
];

const typesOnly = (fn: string) => fn.replace(/\(.*\)/, "");

describe("0022 owner admin migration", () => {
  it("defines every owner function", () => {
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
      if (name !== "owner_restaurant_for_user") {
        expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
      }
    }
    expect(sql).not.toMatch(/grant execute[^;]*to public/);
  });

  it("takes the user id from a parameter and never a role or plan argument", () => {
    expect(sql).not.toMatch(/p_role/);
    expect(sql).not.toMatch(/p_plan\b/);
    expect(sql).toContain("where user_id = p_user_id");
    expect(sql).toMatch(/u\.role not in \('owner', 'manager'\)/);
  });

  it("restores the caller's operator setting before every return", () => {
    const restores = sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\);/g) ?? [];
    // Every function except owner_restaurant_for_user, which restores before it returns.
    expect(restores.length).toBeGreaterThanOrEqual(FUNCTIONS.length - 1);
  });

  it("never lets the app role update or delete the audit log", () => {
    expect(sql).not.toMatch(/grant (update|delete)[^;]*audit_event/);
  });

  it("uses only the agreed refusal codes", () => {
    const codes = new Set(sql.match(/raise exception '([a-z_]+)'/g)?.map((m) => m.replace(/.*'([a-z_]+)'/, "$1")));
    for (const code of codes) {
      expect(["not_allowed", "invalid_value", "rate_limited"]).toContain(code);
    }
  });

  it("does not use dashes in the migration text", () => {
    expect(sql).not.toMatch(/[\u2013\u2014]/);
  });
});
