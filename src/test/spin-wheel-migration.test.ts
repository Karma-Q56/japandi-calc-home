import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0019_spin_wheel_dev.sql", "utf8");

describe("0019 live spin wheel", () => {
  it("caps prizes at eight per restaurant, in the table and in a trigger", () => {
    expect(sql).toMatch(/constraint spin_prize_position_check check \(position between 1 and 8\)/);
    expect(sql).toMatch(/>= 8 then\s+raise exception 'too_many_prizes'/);
  });

  it("keeps prizes and credits behind row level security", () => {
    expect(sql).toMatch(/alter table spin_prize enable row level security;/);
    expect(sql).toMatch(/alter table spin_credit enable row level security;/);
    expect(sql).toMatch(/restaurant_id = app_restaurant\(\) or app_is_operator\(\)/);
  });

  it("makes the spin and the credit functions security definer with a fixed search path", () => {
    expect(sql).toMatch(/create or replace function give_spin_credit\(/i);
    expect(sql).toMatch(/create or replace function spin_wheel\(/i);
    expect(sql.match(/security definer set search_path = public, pg_temp/g)?.length).toBe(2);
  });

  it("revokes public access and grants only to app_user for both functions", () => {
    expect(sql).toMatch(/revoke all on function give_spin_credit\(uuid, uuid, integer\) from public;/);
    expect(sql).toMatch(/grant execute on function give_spin_credit\(uuid, uuid, integer\) to app_user;/);
    expect(sql).toMatch(/revoke all on function spin_wheel\(uuid, text\) from public;/);
    expect(sql).toMatch(/grant execute on function spin_wheel\(uuid, text\) to app_user;/);
  });

  it("checks the membership belongs to the caller's restaurant before spinning", () => {
    expect(sql).toMatch(/if not app_is_operator\(\) and app_restaurant\(\) is distinct from m\.restaurant_id then/);
  });

  it("makes each spin id pay at most once", () => {
    expect(sql).toMatch(/create unique index if not exists spin_result_key_idx/);
    expect(sql).toMatch(/where restaurant_id = m\.restaurant_id and spin_key = p_spin_key/);
  });

  it("restores the operator flag on every return path of the spin", () => {
    const sets = sql.match(/set_config\('app\.is_operator', 'true', true\)/g) ?? [];
    const restores = sql.match(/set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/g) ?? [];
    expect(sets.length).toBeGreaterThan(0);
    expect(restores.length).toBeGreaterThanOrEqual(sets.length);
  });

  it("stores a weekly budget on the restaurant and a value and weekly cap on each prize", () => {
    expect(sql).toMatch(/spin_weekly_budget_cents integer/);
    expect(sql).toMatch(/value_cents integer not null default 0/);
    expect(sql).toMatch(/weekly_cap smallint/);
  });

  it("checks the rolling 7 day budget and each prize's weekly cap before picking", () => {
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).toMatch(/sp\.value_cents <= budget_left/);
    expect(sql).toMatch(/sp\.weekly_cap is null or/);
  });

  it("locks the restaurant row so spins in one restaurant run one at a time", () => {
    expect(sql).toMatch(/from restaurant where id = m\.restaurant_id for update/);
  });

  it("reports no_prizes_left when the budget or caps stop every prize", () => {
    expect(sql).toMatch(/'no_prizes_left'::text/);
  });

  it("gives a bonus stamp with a reason of bonus and a spin key", () => {
    expect(sql).toMatch(/'spin:' \|\| p_spin_key, 'bonus'/);
  });
});
