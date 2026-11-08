import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0016_reward_types_dev.sql", "utf8");

describe("0016 reward types", () => {
  it("only lets a reward have one of the three kinds with a matching value", () => {
    expect(sql).toMatch(/kind = 'free_item' and percent_off is null and amount_off_cents is null/);
    expect(sql).toMatch(/kind = 'percent_off' and percent_off is not null and percent_off between 1 and 100/);
    expect(sql).toMatch(/kind = 'amount_off' and amount_off_cents is not null and amount_off_cents > 0/);
  });

  it("keeps the restaurant's reward kind to the same three values", () => {
    expect(sql).toMatch(/restaurant_reward_kind_check/);
    expect(sql).toMatch(/reward_kind = 'percent_off' and reward_percent_off is not null and reward_percent_off between 1 and 100/);
    expect(sql).toMatch(/reward_kind = 'amount_off' and reward_amount_off_cents is not null and reward_amount_off_cents > 0/);
  });

  it("limits reward validity to 1 to 365 days or no limit", () => {
    expect(sql).toMatch(/reward_valid_days is null or reward_valid_days between 1 and 365/);
  });

  it("makes grant_reward and record_stamp security definer with a locked search path", () => {
    expect(sql.match(/language plpgsql security definer set search_path = public, pg_temp/g)?.length).toBe(2);
  });

  it("saves and restores the operator setting in grant_reward", () => {
    expect(sql).toMatch(/prior_operator text := current_setting\('app\.is_operator', true\)/);
    expect(sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/g)?.length).toBe(2);
  });

  it("keeps grant_reward away from the app role and public", () => {
    expect(sql).toMatch(/revoke all on function grant_reward\(uuid, uuid, text, text, smallint, integer, text, uuid, smallint\) from public/i);
    expect(sql).not.toMatch(/grant execute on function grant_reward/i);
  });

  it("keeps record_stamp callable by the app role with the same grant as 0001", () => {
    expect(sql).toMatch(/revoke all on function record_stamp\(uuid, uuid, uuid, text\) from public/i);
    expect(sql).toMatch(/grant execute on function record_stamp\(uuid, uuid, uuid, text\) to app_user/i);
  });

  it("checks reward sources against the agreed list", () => {
    expect(sql).toMatch(
      /source in \('stamp_card', 'challenge', 'referral', 'spin', 'birthday', 'tier', 'mystery', 'special'\)/,
    );
  });
});
