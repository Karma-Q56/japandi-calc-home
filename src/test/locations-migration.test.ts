import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0015_locations_dev.sql", "utf8");

describe("0015 locations", () => {
  it("turns on and forces row level security for location", () => {
    expect(sql).toMatch(/alter table location enable row level security/i);
    expect(sql).toMatch(/alter table location force row level security/i);
  });

  it("allows one main location per restaurant", () => {
    expect(sql).toMatch(/create unique index location_one_main on location \(restaurant_id\) where is_main/i);
  });

  it("limits writes to the owning restaurant or an operator", () => {
    expect(sql).toMatch(/restaurant_id = app_restaurant\(\) or app_is_operator\(\)/i);
  });

  it("lets anyone read locations only for an active restaurant", () => {
    const publicPolicy = sql.slice(sql.indexOf("policy public_read on location"));
    expect(publicPolicy).toMatch(/r\.status = 'active'/);
  });

  it("never grants delete on location to the app role", () => {
    expect(sql).toMatch(/grant select, insert, update on location to app_user/i);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*location/i);
  });

  it("makes the trigger functions security definer and keeps them off public", () => {
    expect(sql.match(/^\s*security definer/gim)?.length).toBe(2);
    expect(sql).toMatch(/revoke all on function restaurant_add_main_location\(\) from public/i);
    expect(sql).toMatch(/revoke all on function fill_main_location\(\) from public/i);
  });

  it("saves and restores the operator setting in the trigger functions", () => {
    expect(sql.match(/current_setting\('app\.is_operator', true\)/g)?.length).toBe(2);
    expect(sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, 'false'\), true\)/g)?.length).toBe(2);
  });

  it("adds the nullable location column to the four branch tables", () => {
    for (const table of ["staff_member", "stamp_event", "redemption", "reward"]) {
      expect(sql).toMatch(new RegExp(`alter table ${table}\\s+add column location_id uuid references location\\(id\\) on delete set null`));
    }
  });

  it("does not change record_stamp or any other existing function", () => {
    expect(sql).not.toMatch(/create or replace function record_stamp/i);
    expect(sql).not.toMatch(/drop function/i);
  });
});
