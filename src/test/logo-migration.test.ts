import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0023_logo_page_dev.sql", "utf8");

describe("0023 restaurant logo", () => {
  it("stores the PNG and print JPEG with size checks in SQL", () => {
    expect(sql).toMatch(/octet_length\(png\) between 1 and 524288/);
    expect(sql).toMatch(/octet_length\(print_jpeg\) between 1 and 102400/);
    expect(sql).toMatch(/version\s+integer not null default 1 check \(version >= 1\)/);
  });

  it("turns on row level security and a tenant write policy", () => {
    expect(sql).toMatch(/alter table restaurant_logo enable row level security/);
    expect(sql).toMatch(
      /create policy restaurant_logo_write on restaurant_logo for all[\s\S]*restaurant_id = app_restaurant\(\) or app_is_operator\(\)/,
    );
  });

  it("only lets guests and others read the logo of an active restaurant", () => {
    expect(sql).toMatch(/r\.status = 'active'/);
    expect(sql).toMatch(/create policy restaurant_logo_read on restaurant_logo for select/);
  });

  it("grants only the app role the rights it needs and never delete", () => {
    expect(sql).toMatch(/grant select, insert, update on restaurant_logo to app_user/);
    expect(sql).not.toMatch(/grant[^;]*delete/i);
    expect(sql).not.toMatch(/to public/i);
  });
});
