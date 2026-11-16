import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0031_branches_dev.sql", "utf8");

const NEW_FUNCTIONS = [
  "create_location",
  "update_location",
  "set_main_location",
  "deactivate_location",
  "reactivate_location",
  "set_staff_location",
];

describe("migration 0031 branches", () => {
  it("defines every new function as security definer with a fixed search path", () => {
    for (const name of NEW_FUNCTIONS) {
      expect(sql, name).toMatch(new RegExp(`function ${name}\\(`));
    }
    const definers = sql.match(/security definer/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(NEW_FUNCTIONS.length);
    const paths = sql.match(/set search_path = public, pg_temp/g) ?? [];
    expect(paths.length).toBeGreaterThanOrEqual(NEW_FUNCTIONS.length);
  });

  it("revokes from public and grants to app_user for every new function", () => {
    for (const name of NEW_FUNCTIONS) {
      expect(sql, `revoke ${name}`).toMatch(new RegExp(`revoke all on function ${name}\\(`));
      expect(sql, `grant ${name}`).toMatch(new RegExp(`grant execute on function ${name}\\([^;]*to app_user`));
    }
    expect(sql).toMatch(/from public/);
  });

  it("adds the branch columns and the branch-aware main location rule", () => {
    expect(sql).toMatch(/all_branches boolean not null default false/);
    expect(sql).toMatch(/location_id uuid references location\(id\)/);
    expect(sql).toMatch(/create or replace function fill_main_location\(/);
    expect(sql).toMatch(/current_setting\('app\.location_id', true\)/);
  });

  it("checks the restaurant of each id against the caller", () => {
    expect(sql).toMatch(/owner_restaurant_for_user\(p_user_id\)/);
    expect(sql).toMatch(/l\.restaurant_id = rid/);
  });

  it("uses only the refusal codes the server reads", () => {
    for (const code of ["plan_limit_locations", "main_location", "invalid_value", "not_found"]) {
      expect(sql).toMatch(new RegExp(code));
    }
  });
});
