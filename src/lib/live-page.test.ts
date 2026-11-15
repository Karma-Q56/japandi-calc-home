import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABOUT_LIMIT,
  DEFAULT_THEME,
  PAGE_DAYS,
  TAGLINE_LIMIT,
  fullWeek,
  themeForSave,
  validateDesign,
  validatePage,
  type Hours,
} from "./live-page";

const open = (overrides: Hours = {}): Hours => ({
  ...fullWeek({}),
  Monday: { open: "07:00", close: "16:00" },
  ...overrides,
});
const page = (overrides: Record<string, unknown> = {}) => ({
  tagline: "Good coffee",
  about: "",
  suburb: "Melville",
  address: "",
  hours: open(),
  ...overrides,
});

describe("fullWeek", () => {
  it("lists all seven days, closed unless there are hours", () => {
    const week = fullWeek({ Monday: { open: "07:00", close: "16:00" }, Tuesday: null, Funday: { open: "1", close: "2" } });
    expect(Object.keys(week)).toEqual([...PAGE_DAYS]);
    expect(week["Monday"]).toEqual({ open: "07:00", close: "16:00" });
    expect(week["Tuesday"]).toBeNull();
  });
  it("copes with nothing stored", () => {
    expect(Object.values(fullWeek(null)).every((v) => v === null)).toBe(true);
    expect(Object.values(fullWeek(undefined)).every((v) => v === null)).toBe(true);
  });
  it("drops spans that are not two strings", () => {
    expect(fullWeek({ Monday: { open: 7, close: 16 } })["Monday"]).toBeNull();
  });
});

describe("validatePage", () => {
  it("accepts a good page", () => {
    expect(validatePage(page())).toBeNull();
  });
  it("needs a line under the name, within the limit", () => {
    expect(validatePage(page({ tagline: " x " }))).toMatch(/short line/);
    expect(validatePage(page({ tagline: "x".repeat(TAGLINE_LIMIT + 1) }))).toMatch(/70/);
  });
  it("limits the story and needs a suburb", () => {
    expect(validatePage(page({ about: "x".repeat(ABOUT_LIMIT + 1) }))).toMatch(/240/);
    expect(validatePage(page({ about: "x".repeat(ABOUT_LIMIT) }))).toBeNull();
    expect(validatePage(page({ suburb: "" }))).toMatch(/suburb/);
  });
  it("needs sensible hours and at least one open day", () => {
    expect(validatePage(page({ hours: fullWeek({}) }))).toMatch(/at least one day/);
    expect(validatePage(page({ hours: open({ Friday: { open: "16:00", close: "07:00" } }) }))).toBe(
      "Friday must close after it opens.",
    );
    expect(validatePage(page({ hours: open({ Friday: { open: "", close: "07:00" } }) }))).toMatch(/Friday/);
  });
});

describe("validateDesign and themeForSave", () => {
  it("accepts the default theme", () => {
    expect(validateDesign(DEFAULT_THEME)).toBeNull();
  });
  it("refuses bad colours, fonts, shapes and backgrounds", () => {
    expect(validateDesign({ ...DEFAULT_THEME, accent: "red" })).toMatch(/colour/);
    expect(validateDesign({ ...DEFAULT_THEME, headingFont: "Comic Sans" })).toMatch(/heading font/);
    expect(validateDesign({ ...DEFAULT_THEME, bodyFont: "Papyrus" })).toMatch(/body font/);
    expect(validateDesign({ ...DEFAULT_THEME, stampShape: "skull" as never })).toMatch(/shape/);
    expect(validateDesign({ ...DEFAULT_THEME, cardBackground: "photo" as never })).toMatch(/background/);
    expect(validateDesign({ ...DEFAULT_THEME, radius: 99 })).toMatch(/roundness/);
  });
  it("refuses text that is hard to read on the background", () => {
    expect(validateDesign({ ...DEFAULT_THEME, ink: "#faf7ee" })).toMatch(/too close/);
  });
  it("drops the logo and cover photo before saving", () => {
    const clean = themeForSave({ ...DEFAULT_THEME, logo: "/r/x/logo?v=1", coverPhoto: "data:image/png;base64,AA" });
    expect("logo" in clean).toBe(false);
    expect("coverPhoto" in clean).toBe(false);
    expect(clean.accent).toBe(DEFAULT_THEME.accent);
  });
});

describe("migration 0034 text", () => {
  const sql = readFileSync("db/migrations/0034_page_design_live_dev.sql", "utf8");
  for (const fn of ["save_owner_page(text, text, text, text, text, jsonb)", "save_owner_design(text, jsonb)", "sync_owner_logo(text)"]) {
    it(`${fn} is security definer, pinned, revoked from public and granted to the app role`, () => {
      const name = fn.split("(")[0]!;
      const body = sql.slice(sql.indexOf(`function ${name}(`));
      expect(body.slice(0, 600)).toMatch(/security definer set search_path = public, pg_temp/);
      expect(sql).toContain(`revoke all on function ${fn} from public;`);
      expect(sql).toContain(`grant execute on function ${fn} to app_user;`);
    });
  }
  it("takes the restaurant from the login, never from the caller", () => {
    expect(sql.match(/owner_restaurant_for_user\(p_user_id\)/g)?.length).toBe(3);
    expect(sql).not.toMatch(/p_restaurant/);
  });
  it("puts operator context back before it returns", () => {
    expect(sql.match(/set_config\('app.is_operator', coalesce\(prior_operator, ''\), true\)/g)?.length).toBe(3);
  });
  it("cannot set role, plan or status", () => {
    expect(sql).not.toMatch(/update restaurant set[^;]*\b(status|plan|role)\b/i);
  });
  it("uses no em or en dashes", () => {
    expect(sql).not.toMatch(/[\u2013\u2014]/);
  });
});
