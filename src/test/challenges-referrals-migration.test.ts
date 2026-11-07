import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0018_challenges_referrals_dev.sql", "utf8");

describe("0018 challenges and referrals", () => {
  it("makes the two database functions security definer with a locked search path", () => {
    expect(
      sql.match(/language plpgsql security definer set search_path = public, pg_temp/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("saves and restores the operator setting in the functions", () => {
    expect(sql).toMatch(/prior_operator text := current_setting\('app\.is_operator', true\)/);
    expect(
      sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/g)
        ?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the functions away from public and grants only app_user", () => {
    expect(sql).toMatch(/revoke all on function claim_challenge\(uuid, uuid, uuid, text, integer\) from public/i);
    expect(sql).toMatch(/grant execute on function claim_challenge\(uuid, uuid, uuid, text, integer\) to app_user/i);
    expect(sql).toMatch(/revoke all on function reward_referral\(uuid, uuid\) from public/i);
    expect(sql).toMatch(/grant execute on function reward_referral\(uuid, uuid\) to app_user/i);
  });

  it("does not let the browser set the role, plan or reward amount", () => {
    expect(sql).not.toMatch(/grant (insert|update)[^;]*referral/i);
    expect(sql).not.toMatch(/grant (insert|update)[^;]*challenge_claim/i);
  });

  it("keeps the referral code format in the database check", () => {
    expect(sql).toMatch(/\^PAL\[A-HJ-NP-Z2-9\]\{6\}\$/);
  });

  it("gives each referred friend only one reward", () => {
    expect(sql).toMatch(/unique/i);
  });
});
