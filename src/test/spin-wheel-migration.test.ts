import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0019_spin_wheel_dev.sql", "utf8");

/** Every statement that creates one function, so each can be checked on its own. */
const functions = [...sql.matchAll(/create or replace function (\w+)\(([\s\S]*?)\n\$\$;/g)].map((match) => ({
  name: match[1]!,
  text: match[0],
}));
const named = (name: string) => functions.find((item) => item.name === name)!;

const callable = ["save_spin_wheel", "test_spin_wheel", "grant_visit_spin", "spin_state_for_guest", "spin_wheel"];
const helpers = ["spin_random", "spin_prize_eligible", "spin_pick_prize"];

describe("0019 spin wheel migration", () => {
  it("defines every function once", () => {
    expect(functions.map((item) => item.name).sort()).toEqual([...callable, ...helpers].sort());
  });

  it("fixes the search path on every function", () => {
    for (const item of functions) expect(item.text, item.name).toMatch(/set search_path = public, pg_temp/);
  });

  it("makes the callable functions SECURITY DEFINER, revokes them from public and grants only the app role", () => {
    for (const name of callable) {
      expect(named(name).text, name).toMatch(/security definer/);
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
  });

  it("keeps the helpers away from the app role", () => {
    for (const name of helpers) {
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql, name).not.toMatch(new RegExp(`grant execute on function ${name}`));
    }
  });

  it("never grants anything to public and never lets the app role write the wheel tables", () => {
    expect(sql).not.toMatch(/to public/i);
    expect(sql).toMatch(/grant select on spin_config, spin_prize, spin_credit to app_user;/);
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*(spin_config|spin_prize|spin_credit)/i);
    expect(sql).toMatch(/revoke insert, update, delete on spin_result from app_user;/);
  });

  it("forces row level security on every new table with a read policy for the restaurant", () => {
    for (const table of ["spin_config", "spin_prize", "spin_credit"]) {
      expect(sql, table).toMatch(new RegExp(`alter table ${table} enable row level security;`));
      expect(sql, table).toMatch(new RegExp(`alter table ${table} force row level security;`));
      expect(sql, table).toMatch(
        new RegExp(`create policy tenant_read on ${table} for select\\s+using \\(restaurant_id = app_restaurant\\(\\) or app_is_operator\\(\\)\\);`),
      );
    }
  });

  it("limits the wheel to 8 prizes, a used count that cannot pass earned, and one result per spin id", () => {
    expect(sql).toMatch(/position smallint not null check \(position between 1 and 8\)/);
    expect(sql).toMatch(/unique \(restaurant_id, position\)/);
    expect(sql).toMatch(/check \(used <= earned\)/);
    expect(sql).toMatch(/create unique index if not exists spin_result_spin_once on spin_result \(membership_id, spin_id\)/);
    expect(sql).toMatch(/create unique index if not exists spin_result_join_once on spin_result \(membership_id\) where mode = 'join'/);
    expect(sql).toMatch(/create unique index if not exists spin_result_decide_once on spin_result \(reward_id\) where mode = 'reward_decider'/);
  });

  it("takes the signed-in user from the server and never a restaurant from the caller (owner functions)", () => {
    for (const name of ["save_spin_wheel", "test_spin_wheel"]) {
      expect(named(name).text, name).toMatch(/owner_restaurant_for_user\(p_user_id\)/);
      expect(named(name).text, name).not.toMatch(/p_restaurant/);
    }
  });

  it("checks the guest owns the card before reading or spinning", () => {
    for (const name of ["spin_state_for_guest", "spin_wheel"]) {
      expect(named(name).text, name).toMatch(/customer_id = app_customer\(\)/);
      expect(named(name).text, name).toMatch(/raise exception 'not_allowed'/);
    }
  });

  it("checks the restaurant context before counting a visit", () => {
    expect(named("grant_visit_spin").text).toMatch(/app_restaurant\(\) is distinct from p_restaurant/);
  });

  it("locks the membership and the spin credit so two taps cannot both pay", () => {
    const spin = named("spin_wheel").text;
    expect(spin).toMatch(/from membership where id = p_membership and customer_id = app_customer\(\) for update/);
    expect(spin).toMatch(/from spin_credit where membership_id = m\.id for update/);
    expect(named("grant_visit_spin").text).toMatch(/from spin_credit where membership_id = p_membership for update/);
  });

  it("gives prizes only through grant_reward or bonus stamps", () => {
    const spin = named("spin_wheel").text;
    expect(spin).toMatch(/grant_reward\(/);
    expect(spin).toMatch(/'spin:' \|\| new_result::text/);
    expect(spin).not.toMatch(/insert into reward/);
  });

  it("puts the caller's operator setting back wherever it switches operator on", () => {
    for (const name of ["save_spin_wheel", "grant_visit_spin", "spin_wheel"]) {
      const text = named(name).text;
      expect(text, name).toMatch(/prior_operator text := current_setting\('app\.is_operator', true\)/);
      expect(text, name).toMatch(/set_config\('app\.is_operator', 'true', true\)/);
      expect(text, name).toMatch(/set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/);
    }
  });

  it("does not show the weights to a guest", () => {
    // It filters on weight (a prize with no chance is hidden) but never puts a weight in what it returns.
    expect(named("spin_state_for_guest").text).not.toMatch(/'weight'|, weight\b.*jsonb_build_object/);
    expect(named("spin_state_for_guest").text).toMatch(/jsonb_build_object\('id', id, 'label', label, 'type', prize_type\)/);
  });

  it("uses no long dashes", () => {
    expect(sql).not.toMatch(/[\u2013\u2014]/);
  });
});
