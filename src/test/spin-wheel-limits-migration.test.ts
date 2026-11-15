import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0035_spin_wheel_limits_dev.sql", "utf8");

const functions = [...sql.matchAll(/create or replace function (\w+)\(([\s\S]*?)\n\$\$;/g)].map((match) => ({
  name: match[1]!,
  text: match[0],
}));
const named = (name: string) => functions.find((item) => item.name === name)!;

const callable = ["save_spin_wheel", "test_spin_wheel", "spin_state_for_guest", "spin_wheel"];
const helpers = ["spin_prize_capped", "spin_real_counts", "spin_pick_prize"];

describe("0035 spin wheel weekly limits migration", () => {
  it("says it is not applied", () => {
    expect(sql.slice(0, 200)).toMatch(/NOT APPLIED/);
  });

  it("defines each function once", () => {
    expect(functions.map((item) => item.name).sort()).toEqual([...callable, ...helpers].sort());
  });

  it("fixes the search path on every function", () => {
    for (const item of functions) expect(item.text, item.name).toMatch(/set search_path = public, pg_temp/);
  });

  it("keeps the callable functions SECURITY DEFINER with the grants they had", () => {
    for (const name of callable) {
      expect(named(name).text, name).toMatch(/security definer/);
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user;`));
    }
  });

  it("never grants the helpers to the app role", () => {
    for (const name of helpers) {
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public;`));
      expect(sql, name).not.toMatch(new RegExp(`grant execute on function ${name}\\(`));
    }
  });

  it("keeps the limit a count of wins in 7 days, never money", () => {
    expect(sql).toMatch(/weekly_cap smallint/);
    expect(sql).toMatch(/weekly_cap between 1 and 10000/);
    expect(named("spin_prize_capped").text).toMatch(/interval '7 days'/);
    expect(named("spin_prize_capped").text).toMatch(/count\(\*\)/);
    expect(sql).not.toMatch(/budget/i);
  });

  it("takes capped prizes out of the draw and stops the wheel when every real prize is capped", () => {
    const pick = named("spin_pick_prize").text;
    expect(pick.match(/not spin_prize_capped\(id\)/g)).toHaveLength(2);
    expect(pick).toMatch(/real_pool > 0 and real_open = 0/);
    expect(named("spin_wheel").text).toMatch(/raise exception 'prizes_gone'/);
    expect(named("test_spin_wheel").text).toMatch(/raise exception 'prizes_gone'/);
    expect(named("spin_state_for_guest").text).toMatch(/'paused', paused/);
  });

  it("runs spins on one wheel one at a time, so two guests cannot both take the last win", () => {
    expect(named("spin_wheel").text).toMatch(/from spin_config where restaurant_id = m\.restaurant_id for update/);
  });

  it("saves prizes by position so the wins counted against a limit survive an edit", () => {
    const save = named("save_spin_wheel").text;
    expect(save).toMatch(/on conflict \(restaurant_id, position\) do update/);
    expect(save).not.toMatch(/delete from spin_prize where restaurant_id = rid;/);
    expect(save).toMatch(/delete from spin_prize where restaurant_id = rid and position > jsonb_array_length\(p_prizes\)/);
    expect(save).toMatch(/!~ '\^\[0-9\]\{1,5\}\$'/);
  });

  it("does not let the browser reach the limit helpers or change the limit without the owner check", () => {
    const save = named("save_spin_wheel").text;
    // The restaurant always comes from the signed-in owner, never from an argument, and it is the first thing read.
    expect(save).toMatch(/begin\n\s+rid := owner_restaurant_for_user\(p_user_id\);/);
    expect(save).not.toMatch(/p_restaurant/);
  });
});
