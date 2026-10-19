import { describe, expect, it } from "vitest";
import { LEAD_COLUMNS, leadValues, renderLeadInsertSql } from "./pg";
import { createDemoRepos } from "./demo";

describe("lead insert column/value parity", () => {
  it("renders the same column count as value placeholders", () => {
    const text = renderLeadInsertSql();
    const colsSection = text.slice(text.indexOf("(") + 1, text.indexOf(")"));
    const columns = colsSection.split(",").map((c) => c.trim());
    const placeholders = text.match(/\$\d+/g) ?? [];
    expect(columns).toEqual([...LEAD_COLUMNS]);
    expect(placeholders.length).toBe(LEAD_COLUMNS.length);
    expect(text).toContain(`$${LEAD_COLUMNS.indexOf("calculator") + 1}::jsonb`);
  });

  it("leadValues returns one value per column, calculator included", () => {
    const values = leadValues({
      restaurantName: "R",
      contactName: "C",
      phone: "+27821234567",
      consent: true,
      calculator: { guests: 10 },
    });
    expect(values.length).toBe(LEAD_COLUMNS.length);
    expect(values[LEAD_COLUMNS.indexOf("calculator")]).toBe(JSON.stringify({ guests: 10 }));
    const without = leadValues({ restaurantName: "R", contactName: "C", phone: "+27821234567", consent: true });
    expect(without.length).toBe(LEAD_COLUMNS.length);
    expect(without[LEAD_COLUMNS.indexOf("calculator")]).toBeNull();
  });

  it("demo rejects the 6th lead from one phone or one IP", async () => {
    const repos = createDemoRepos();
    const base = {
      restaurantName: "R",
      contactName: "C",
      consent: true as const,
      ipHash: "ipso-facto-test",
    };
    for (let i = 0; i < 5; i++) {
      await repos.submitLead({ ...base, phone: `+2782000000${i}` });
    }
    await expect(repos.submitLead({ ...base, phone: "+27829999999" })).rejects.toThrow(/Too many/);
    const otherIp = createDemoRepos();
    for (let i = 0; i < 5; i++) {
      await otherIp.submitLead({ restaurantName: "R", contactName: "C", phone: "+27821111111", consent: true });
    }
    await expect(
      otherIp.submitLead({ restaurantName: "R", contactName: "C", phone: "+27821111111", consent: true }),
    ).rejects.toThrow(/Too many/);
  });
});
