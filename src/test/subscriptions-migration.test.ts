import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text checks on migration 0038 (D25 billing finish: monthly renewals, failed payments, grace, pausing).
const sql = readFileSync("db/migrations/0038_subscriptions_dev.sql", "utf8");

const definers = [
  "settle_card_payment(uuid, integer, text, text, text)",
  "find_subscription_payment(text)",
  "claim_due_campaigns(timestamptz, integer)",
  "operator_set_subscription_state(text, uuid, text, text)",
  "create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer, text)",
];

describe("migration 0038 (subscriptions and billing finish)", () => {
  it("creates the subscription and charge tables with row level security forced on", () => {
    expect(sql).toMatch(/create table subscription \(/);
    expect(sql).toMatch(/create table subscription_charge \(/);
    expect(sql).toMatch(/alter table subscription enable row level security;/);
    expect(sql).toMatch(/alter table subscription force row level security;/);
    expect(sql).toMatch(/alter table subscription_charge enable row level security;/);
    expect(sql).toMatch(/alter table subscription_charge force row level security;/);
  });

  it("limits the subscription state to the three allowed values", () => {
    expect(sql).toMatch(/check \(state in \('active', 'past_due', 'cancelled'\)\)/);
  });

  it("marks every SECURITY DEFINER function with a fixed search_path", () => {
    const found = sql.match(/security definer/g) ?? [];
    const paths = sql.match(/set search_path = public, pg_temp/g) ?? [];
    expect(paths.length).toBe(found.length);
    expect(found.length).toBeGreaterThanOrEqual(definers.length);
  });

  it("revokes every granted SECURITY DEFINER function from public and grants it only to app_user", () => {
    for (const signature of definers) {
      const escaped = signature.replace(/[()]/g, "\\$&");
      expect(sql).toMatch(new RegExp(`revoke all on function ${escaped} from public;`));
      expect(sql).toMatch(new RegExp(`grant execute on function ${escaped} to app_user;`));
    }
  });

  it("lets the app role read the subscription but never write the tables directly", () => {
    expect(sql).toMatch(/revoke all on subscription from public;/);
    expect(sql).toMatch(/revoke all on subscription_charge from public;/);
    expect(sql).toMatch(/grant select on subscription to app_user;/);
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*\bon subscription(_charge)?\b/i);
  });

  it("makes the operator subscription change check the operator flag", () => {
    expect(sql).toMatch(/operator_set_subscription_state[\s\S]*?app_is_operator\(\)|operator_set_subscription_state[\s\S]*?is_operator/);
  });
});
