import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0026_campaigns_live_dev.sql", "utf8");

describe("0026 campaigns live", () => {
  it("makes the write functions security definer with a fixed search path", () => {
    expect(sql.match(/security definer set search_path = public, pg_temp/gi)?.length).toBe(3);
  });

  it("revokes every function from public and grants create and top up to the app role only", () => {
    expect(sql).toMatch(/revoke all on function create_campaign\(uuid, text, text, text, jsonb, text, timestamptz, integer\) from public/i);
    expect(sql).toMatch(/grant execute on function create_campaign\(uuid, text, text, text, jsonb, text, timestamptz, integer\) to app_user/i);
    expect(sql).toMatch(/revoke all on function request_topup\(uuid, text, integer, text\) from public/i);
    expect(sql).toMatch(/grant execute on function request_topup\(uuid, text, integer, text\) to app_user/i);
    expect(sql).toMatch(/revoke all on function campaign_audience_ids\(uuid, jsonb, timestamptz\) from public/i);
  });

  it("takes the caller's role from app_user and refuses anyone but an owner or manager", () => {
    expect(sql).toMatch(/from app_user where user_id = p_user/);
    expect(sql).toMatch(/caller_role not in \('owner', 'manager'\)/);
    expect(sql).toMatch(/caller_restaurant is distinct from p_restaurant/);
  });

  it("reserves the cost once with a fixed reference and refuses when credit is short", () => {
    expect(sql).toMatch(/'reserve', -cost, 'reserve:' \|\| new_id/);
    expect(sql).toMatch(/if balance < cost then/);
    expect(sql).toMatch(/raise exception 'not_enough_credit'/);
  });

  it("prices the campaign on the server and never trusts a cost from the browser", () => {
    expect(sql).toMatch(/cost := recipients \* p_est_segments \* 35/);
    expect(sql).not.toMatch(/p_est_cost_cents/);
  });

  it("moves quiet-hour sends to 08:00 SAST and refuses a send time in the past", () => {
    expect(sql).toMatch(/'Africa\/Johannesburg'/);
    expect(sql).toMatch(/extract\(hour from local_time\) >= 20/);
    expect(sql).toMatch(/raise exception 'time_in_past'/);
  });

  it("counts only opted in guests who are not erased and are under the member cap", () => {
    expect(sql).toMatch(/m\.marketing_sms = 'opted_in'/);
    expect(sql).toMatch(/c\.erased_at is null/);
    expect(sql).toMatch(/< r\.member_weekly_cap/);
  });

  it("requests a top up as a pending payment and moves no money", () => {
    expect(sql).toMatch(/'topup', p_amount_cents, 'pending'/);
    expect(sql).not.toMatch(/insert into credit_ledger[^;]*topup/i);
  });
});
