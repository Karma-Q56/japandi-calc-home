import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0020_specials_live_dev.sql", "utf8");

describe("0020 specials", () => {
  it("adds the reward and discount columns to special with their limits", () => {
    expect(sql).toMatch(/reward_text/);
    expect(sql).toMatch(/percent_off between 1 and 100/);
    expect(sql).toMatch(/amount_off_cents between 1 and 1000000/);
    expect(sql).toMatch(/check \(percent_off is null or amount_off_cents is null\)/);
  });

  it("limits special kinds to public, members and targeted", () => {
    expect(sql).toMatch(/check \(kind in \('public', 'members', 'targeted'\)\)/);
  });

  it("turns on and forces row level security for special_use", () => {
    expect(sql).toMatch(/alter table special_use enable row level security/i);
    expect(sql).toMatch(/alter table special_use force row level security/i);
  });

  it("keeps one redemption per restaurant idempotency key", () => {
    expect(sql).toMatch(/unique \(restaurant_id, idempotency_key\)/);
  });

  it("never grants delete on special_use to the app role", () => {
    expect(sql).toMatch(/grant select, insert on special_use to app_user/i);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*special_use/i);
  });

  it("makes redeem_special_code security definer with a fixed search path", () => {
    expect(sql).toMatch(/security definer set search_path = public, pg_temp/i);
  });

  it("saves and restores the operator setting in the redemption function", () => {
    expect(sql).toMatch(/perform set_config\('app\.is_operator', 'true', true\)/);
    expect(sql.match(/perform set_config\('app\.is_operator', coalesce\(prior_operator, ''\), true\)/g)?.length).toBeGreaterThan(1);
  });

  it("keeps the redemption function off public and grants it only to the app role", () => {
    expect(sql).toMatch(/revoke all on function redeem_special_code\(uuid, text, uuid, uuid, text\) from public/i);
    expect(sql).toMatch(/grant execute on function redeem_special_code\(uuid, text, uuid, uuid, text\) to app_user/i);
  });

  it("writes an audit event when a special is redeemed", () => {
    expect(sql).toMatch(/insert into audit_event/i);
    expect(sql).toMatch(/'special\.redeemed'/);
  });
});
