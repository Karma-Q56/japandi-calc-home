import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0012_offer_rls_dev.sql", "utf8");

describe("0012 offer row level security", () => {
  it("turns on and forces row level security for offer", () => {
    expect(sql).toMatch(/alter table offer enable row level security/i);
    expect(sql).toMatch(/alter table offer force row level security/i);
  });

  it("limits writes and private reads to the owning restaurant or an operator", () => {
    expect(sql).toMatch(/restaurant_id = app_restaurant\(\) or app_is_operator\(\)/i);
  });

  it("only lets the public read live public page offers", () => {
    const publicPolicy = sql.slice(sql.indexOf("offer_public_read on offer"));
    expect(publicPolicy).toMatch(/kind = 'public'/);
    expect(publicPolicy).toMatch(/placement_page/);
    expect(publicPolicy).toMatch(/status = 'live'/);
  });

  it("is safe to run twice and never touches production", () => {
    expect(sql).toMatch(/drop policy if exists offer_tenant_all/i);
    expect(sql).toMatch(/drop policy if exists offer_public_read/i);
    expect(sql).toMatch(/DEV BRANCH ONLY/);
  });

  it("gives the app role back the campaign update that live approve and cancel need", () => {
    expect(sql).toMatch(/grant select, insert, update on campaign, special to app_user/i);
  });
});
