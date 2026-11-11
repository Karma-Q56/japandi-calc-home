import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0021_dish_challenge_dev.sql", "utf8");

describe("migration 0021 (try this dish)", () => {
  it("is marked not applied and allows the try_item kind", () => {
    expect(sql).toContain("NOT APPLIED");
    expect(sql).toContain("kind = 'try_item'");
  });

  it("adds the dish and section columns", () => {
    expect(sql).toContain("menu_item_id uuid references menu_item(id)");
    expect(sql).toContain("menu_section_id uuid references menu_section(id)");
  });

  it("requires exactly one of dish or section for try_item", () => {
    expect(sql).toContain("num_nonnulls(menu_item_id, menu_section_id) = 1");
  });

  it("checks the same restaurant with a security definer trigger", () => {
    expect(sql).toMatch(/create or replace function challenge_menu_same_restaurant\(\)[\s\S]*security definer/);
    expect(sql).toContain("menu_item_other_restaurant");
    expect(sql).toContain("menu_section_other_restaurant");
  });

  it("keeps the new functions private to the app role", () => {
    expect(sql).toContain("revoke all on function challenge_try_item_progress(uuid, uuid) from public;");
    expect(sql).toContain("grant execute on function challenge_try_item_progress(uuid, uuid) to app_user;");
    expect(sql).toContain("grant execute on function challenge_progress(uuid, uuid) to app_user;");
  });

  it("uses plpgsql for the functions that read visit_item, which 0024 creates later", () => {
    expect(sql).toMatch(/challenge_try_item_progress\(p_challenge uuid, p_membership uuid\)\s+returns integer\s+language plpgsql/);
    expect(sql).toMatch(/challenge_progress\(p_challenge uuid, p_membership uuid\)\s+returns integer\s+language plpgsql/);
  });

  it("counts only orders inside the window and after the challenge started", () => {
    expect(sql).toContain("se.created_at >= greatest(c.created_at, now() - make_interval(days => c.window_days))");
  });
});
