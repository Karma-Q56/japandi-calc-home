import { describe, expect, it } from "vitest";
import { buildCsv, changeLabel, checkWindow, MAX_CUSTOM_DAYS, windowFor } from "./live-insights";

describe("changeLabel", () => {
  it("says there is no earlier data when the previous period is zero", () => {
    expect(changeLabel(5, 0)).toBe("No earlier data to compare");
  });
  it("says no change when both periods are zero or equal", () => {
    expect(changeLabel(0, 0)).toBe("No change");
    expect(changeLabel(10, 10)).toBe("No change");
  });
  it("reports up and down percentages", () => {
    expect(changeLabel(15, 10)).toBe("Up 50%");
    expect(changeLabel(5, 10)).toBe("Down 50%");
  });
});

describe("checkWindow", () => {
  it("accepts a single day and a full allowed range", () => {
    expect(checkWindow("2026-11-01", "2026-11-01")).toBeNull();
    expect(checkWindow("2026-01-01", "2026-02-04")).toBeNull();
  });
  it("refuses an end date before the start", () => {
    expect(checkWindow("2026-11-02", "2026-11-01")).toMatch(/on or after/);
  });
  it("refuses ranges longer than the limit", () => {
    const start = "2025-01-01";
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + MAX_CUSTOM_DAYS * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(checkWindow(start, end)).toMatch(/or less/);
  });
  it("refuses malformed and impossible dates", () => {
    expect(checkWindow("2026/11/01", "2026-11-01")).toMatch(/look like/);
    expect(checkWindow("2026-02-30", "2026-03-01")).toMatch(/real calendar/);
  });
});

describe("windowFor", () => {
  it("covers the requested number of days ending today", () => {
    expect(windowFor("2026-11-10", 7)).toEqual({ from: "2026-11-04", to: "2026-11-10" });
    expect(windowFor("2026-11-10", 1)).toEqual({ from: "2026-11-10", to: "2026-11-10" });
  });
});

describe("buildCsv", () => {
  it("writes a header and CRLF rows, quoting cells that need it", () => {
    const csv = buildCsv(["date", "visits", "note"], [
      { date: "2026-11-01", visits: 3, note: "plain" },
      { date: "2026-11-02", visits: 0, note: 'has "quotes", commas' },
    ]);
    expect(csv).toBe(
      'date,visits,note\r\n2026-11-01,3,plain\r\n2026-11-02,0,"has ""quotes"", commas"\r\n',
    );
  });
  it("writes only the header when there are no rows", () => {
    expect(buildCsv(["date", "visits"], [])).toBe("date,visits\r\n");
  });
});
