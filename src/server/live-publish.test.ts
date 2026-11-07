import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "./auth-viewer";
import {
  PUBLISH_PER_HOUR,
  publishRestaurant,
  refusalCode,
  setRestaurantListed,
  unpublishRestaurant,
} from "./live-publish";

// The database is mocked the way live-onboarding.test.ts does it: the mock answers by SQL text.

const db = {
  mode: "live",
  queries: [] as string[],
  publishRefusal: "",
  attempts: 0,
};

vi.mock("./db", () => ({
  withContext: async (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        db.queries.push(text);
        if (text.includes("count(*)::int as n from rate_limit_hit")) {
          return { rows: [{ n: db.attempts }] };
        }
        if (text.includes("insert into rate_limit_hit")) {
          db.attempts++;
          return { rows: [] };
        }
        if (text.includes("publish_restaurant(") || text.includes("unpublish_restaurant(") || text.includes("set_restaurant_listed(")) {
          if (db.publishRefusal) throw new Error(db.publishRefusal);
          return { rows: [{ status: "ok" }] };
        }
        return { rows: [] };
      },
    };
    return cb(tx);
  },
}));

vi.mock("./db/mode", () => ({
  getDataMode: () => db.mode,
}));

const owner: Viewer = {
  userId: "user-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  restaurantId: "11111111-1111-4111-8111-111111111111",
  customerId: null,
  needsPhone: false,
} as Viewer;

const staff: Viewer = { ...owner, userId: "user-staff", role: "staff" as Viewer["role"] };
const guest: Viewer = { ...owner, userId: "user-guest", role: "guest", restaurantId: null };

beforeEach(() => {
  process.env["DATABASE_URL"] = "postgres://test-only";
  db.mode = "live";
  db.queries = [];
  db.publishRefusal = "";
  db.attempts = 0;
});

describe("publish server functions", () => {
  it("lets the owner publish and calls the SQL function with the caller's user id", async () => {
    const result = await publishRestaurant(owner);
    expect(result).toEqual({ ok: true });
    expect(db.queries.some((q) => q.includes("publish_restaurant("))).toBe(true);
  });

  it("refuses a guest and a staff member without touching the database", async () => {
    expect(await publishRestaurant(guest)).toEqual({
      ok: false,
      message: "Only the owner or a manager can change this.",
    });
    expect(await unpublishRestaurant(staff)).toEqual({
      ok: false,
      message: "Only the owner or a manager can change this.",
    });
    expect(db.queries).toHaveLength(0);
  });

  it("refuses everything outside live mode", async () => {
    db.mode = "demo";
    expect((await publishRestaurant(owner)).ok).toBe(false);
    expect(db.queries).toHaveLength(0);
  });

  it("shows the checklist wording when the database says not ready", async () => {
    db.publishRefusal = "not_ready";
    expect(await publishRestaurant(owner)).toEqual({
      ok: false,
      message: "Finish the checklist before you publish.",
    });
  });

  it("refuses the 11th publish attempt in an hour", async () => {
    db.attempts = PUBLISH_PER_HOUR;
    expect(await publishRestaurant(owner)).toEqual({
      ok: false,
      message: "You have tried too many times this hour. Try again later.",
    });
    expect(db.queries.some((q) => q.includes("publish_restaurant("))).toBe(false);
  });

  it("allows the tenth attempt", async () => {
    db.attempts = PUBLISH_PER_HOUR - 1;
    expect((await publishRestaurant(owner)).ok).toBe(true);
  });

  it("passes the listing choice through to the SQL function", async () => {
    expect((await setRestaurantListed(owner, true)).ok).toBe(true);
    expect(db.queries.some((q) => q.includes("set_restaurant_listed("))).toBe(true);
  });

  it("reads the refusal code from the error chain only by exact match", () => {
    const inner = new Error("not_ready");
    const wrapped = new Error("select publish_restaurant($1) with values", { cause: inner });
    expect(refusalCode(wrapped)).toBe("not_ready");
    expect(refusalCode(new Error("some other text not_ready here"))).toBeNull();
  });
});

describe("migration 0014 text", () => {
  const sqlText = readFileSync("db/migrations/0014_publish_dev.sql", "utf8");

  it("runs each function as security definer with a fixed search path", () => {
    const definers = sqlText.match(/security definer/g) ?? [];
    const paths = sqlText.match(/set search_path = public, pg_temp/g) ?? [];
    expect(definers.length).toBe(paths.length);
    expect(definers.length).toBeGreaterThanOrEqual(5);
  });

  it("revokes the helper from public and never grants it to the app role", () => {
    expect(sqlText).toContain("revoke all on function publish_restaurant_for_user(text) from public;");
    expect(sqlText).not.toMatch(/grant execute on function publish_restaurant_for_user/);
  });

  it("grants only the four public functions to app_user", () => {
    const grants = sqlText.match(/grant execute on function [a-z_]+/g) ?? [];
    expect(grants.sort()).toEqual([
      "grant execute on function publish_restaurant",
      "grant execute on function restaurant_readiness",
      "grant execute on function set_restaurant_listed",
      "grant execute on function unpublish_restaurant",
    ]);
  });

  it("replaces the public read policies with active-only ones", () => {
    expect(sqlText).toContain("drop policy if exists public_read on menu_section;");
    expect(sqlText).toContain("r.status = 'active'");
    expect(sqlText).not.toMatch(/for select using \(true\)/);
  });
});
