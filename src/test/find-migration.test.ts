import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0030_find_dev.sql", "utf8");

describe("0030 live Find directory", () => {
  it("adds a venue type with only the allowed values", () => {
    expect(sql).toMatch(/add column if not exists venue_type text not null default 'other'/i);
    expect(sql).toMatch(
      /check \(venue_type in \('cafe', 'bakery', 'restaurant', 'takeaway', 'other'\)\)/i,
    );
  });

  it("defines find_restaurants as security definer with a fixed search path", () => {
    expect(sql).toMatch(/create or replace function find_restaurants\(/i);
    expect(sql).toMatch(/security definer\s+set search_path = public, pg_temp/i);
  });

  it("lists only active, publicly listed restaurants", () => {
    expect(sql).toMatch(/r\.status = 'active'/);
    expect(sql).toMatch(/r\.public_listed = true/);
  });

  it("caps a page at 24 rows", () => {
    expect(sql).toMatch(/limit least\(greatest\(coalesce\(p_limit, 24\), 1\), 24\)/);
  });

  it("flags member offers only for active, non-public specials", () => {
    expect(sql).toMatch(/s\.active/);
    expect(sql).toMatch(/s\.kind <> 'public'/);
  });

  it("escapes LIKE wildcards in the search text", () => {
    expect(sql).toMatch(/replace\(replace\(replace\(lower\(btrim\(p_query\)\), '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/);
    expect(sql).toMatch(/escape '\\'/);
  });

  it("is off limits to the public and open only to app_user", () => {
    expect(sql).toMatch(
      /revoke all on function find_restaurants\(text, text, text, integer, integer\) from public/i,
    );
    expect(sql).toMatch(
      /grant execute on function find_restaurants\(text, text, text, integer, integer\) to app_user/i,
    );
  });

  it("does not let the caller pick a restaurant, role, plan or status", () => {
    const signature = sql.slice(sql.indexOf("create or replace function find_restaurants("), sql.indexOf("returns table"));
    expect(signature).not.toMatch(/status|role|plan|restaurant_id|operator/i);
    expect(sql).not.toMatch(/set_config|app\.is_operator/);
  });

  it("does not return private columns", () => {
    const returns = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
    for (const column of ["contact", "sms_sender_name", "theme", "plan", "organization_id"]) {
      expect(returns).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });
});
