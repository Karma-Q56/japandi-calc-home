import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text checks on migration 0039 (D26 venue type, address checks, page address changes).
const sql = readFileSync("db/migrations/0039_find_details_dev.sql", "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const definers = [
  "save_owner_settings",
  "save_owner_page",
  "restaurant_slug_reserved",
  "resolve_slug_redirect",
  "operator_change_slug",
];

describe("migration 0039 (find details and page address changes)", () => {
  it("marks every SECURITY DEFINER function with a fixed search_path", () => {
    const security = code.match(/security definer/g) ?? [];
    const paths = code.match(/set search_path = public, pg_temp/g) ?? [];
    expect(security.length).toBe(definers.length);
    expect(paths.length).toBe(security.length);
  });

  it("revokes every function from public and grants it only to app_user", () => {
    for (const name of [...definers, "valid_address_text", "valid_suburb_text"]) {
      expect(code, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(code, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
  });

  it("recreates both save functions with a last parameter that defaults to null", () => {
    expect(code).toMatch(/drop function if exists save_owner_settings\(text, text, text, text, text, text, text, boolean, boolean, integer, integer\);/);
    expect(code).toMatch(/drop function if exists save_owner_page\(text, text, text, text, text, jsonb\);/);
    expect(code.match(/p_venue_type text default null/g)?.length).toBe(2);
  });

  it("checks the venue type against the five allowed values in both save functions", () => {
    const matches = code.match(/'cafe', 'bakery', 'restaurant', 'takeaway', 'other'/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("enables and forces row level security on slug_redirect with no direct grants", () => {
    expect(code).toMatch(/alter table slug_redirect enable row level security;/);
    expect(code).toMatch(/alter table slug_redirect force row level security;/);
    expect(code).toMatch(/revoke all on slug_redirect from public;/);
    expect(code).not.toMatch(/grant [^;]*\bon slug_redirect\b/i);
  });

  it("checks the operator before changing a page address", () => {
    const body = code.slice(code.indexOf("create or replace function operator_change_slug"));
    expect(body.indexOf("perform assert_operator(p_operator_id);")).toBeGreaterThan(0);
    expect(body.indexOf("perform assert_operator(p_operator_id);")).toBeLessThan(body.indexOf("update restaurant set slug"));
  });

  it("never takes a role or a status as an input", () => {
    expect(code).not.toMatch(/p_role\b/);
    expect(code).not.toMatch(/p_status\b/);
  });
});
