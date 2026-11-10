import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0024_till_orders_dev.sql", "utf8");

describe("0024 till orders migration", () => {
  it("defines the record_visit_items function as security definer with a fixed search path", () => {
    expect(sql).toMatch(
      /create or replace function record_visit_items\(p_stamp_event uuid, p_items jsonb\)[\s\S]*?language plpgsql security definer set search_path = public, pg_temp/,
    );
  });

  it("revokes execute from public and grants it to app_user only", () => {
    expect(sql).toContain("revoke all on function record_visit_items(uuid, jsonb) from public;");
    expect(sql).toContain("grant execute on function record_visit_items(uuid, jsonb) to app_user;");
  });

  it("does not let the caller set a role, plan or status", () => {
    expect(sql).not.toMatch(/p_role|p_plan|p_status|p_credit/);
  });
});
