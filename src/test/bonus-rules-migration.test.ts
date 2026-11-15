import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0017_bonus_rules_dev.sql", "utf8");

describe("0017 bonus rules and tiers", () => {
  it("keeps the streak and double stamp settings inside the agreed limits", () => {
    expect(sql).toMatch(/streak_weeks between 2 and 12/);
    expect(sql).toMatch(/streak_weekly_visits between 1 and 7/);
    expect(sql).toMatch(/streak_bonus_stamps between 1 and 5/);
    expect(sql).toMatch(/double_stamp_weekday between 0 and 6/);
  });

  it("checks that VIP needs more visits than Regular", () => {
    expect(sql).toMatch(/restaurant_tiers_check/);
    expect(sql).toMatch(/\(tiers->>'vip'\)::int > \(tiers->>'regular'\)::int/);
  });

  it("makes the three bonus functions security definer with a locked search path", () => {
    expect(
      sql.match(/language plpgsql (stable )?security definer set search_path = public, pg_temp/g)
        ?.length,
    ).toBe(3);
  });

  it("saves and restores the operator setting in the bonus functions", () => {
    expect(sql).toMatch(/prior_operator text := current_setting\('app\.is_operator', true\)/);
    expect(
      sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/g)
        ?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the bonus functions away from public and grants only app_user", () => {
    expect(sql).toMatch(/revoke all on function apply_visit_bonuses\(uuid, uuid\) from public/i);
    expect(sql).toMatch(/grant execute on function apply_visit_bonuses\(uuid, uuid\) to app_user/i);
    expect(sql).toMatch(
      /revoke all on function apply_birthday_and_mystery\(uuid, uuid\) from public/i,
    );
    expect(sql).toMatch(
      /grant execute on function apply_birthday_and_mystery\(uuid, uuid\) to app_user/i,
    );
  });

  it("uses the same budget keys as the demo so the monthly cap counts them", () => {
    expect(sql).toMatch(/'double:'/);
    expect(sql).toMatch(/'streak:'/);
    expect(sql).toMatch(/'mystery:'/);
    expect(sql).toMatch(/idempotency_key like 'missyou:%'/);
  });

  it("does not let a grant go past the monthly budget", () => {
    expect(sql).toMatch(/r\.tool_stamp_budget = 0 or used \+ 1 <= r\.tool_stamp_budget/);
    expect(sql).toMatch(/used \+ r\.streak_bonus_stamps <= r\.tool_stamp_budget/);
  });
});
