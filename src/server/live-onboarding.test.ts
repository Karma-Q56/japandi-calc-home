import { readFileSync } from "node:fs";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "./auth-viewer";
import {
  RESTAURANT_CREATE_PER_HOUR,
  SLUG_CHECK_PER_HOUR,
  checkSlug,
  createRestaurantForGuest,
  loadMyRestaurant,
  plainCreateError,
  refusalCode,
  slugProblem,
} from "./live-onboarding";

// The database is mocked the way live-till.test.ts does it: the mock answers by SQL
// text and keeps only the state these tests need.

const db = {
  mode: "live",
  queries: [] as string[],
  restaurantSlugs: [] as string[],
  // What the create function answers with: "" for success, or a refusal code.
  createRefusal: "",
  // When true the refusal is wrapped the way the real driver wraps it: the message holds the
  // query text and the typed values, and the database's own message sits in `cause`.
  wrapRefusal: false,
  restaurantStatus: "draft",
  createCalls: 0,
  attemptsByBucket: {} as Record<string, number>,
};

vi.mock("./db", () => ({
  withContext: async (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        db.queries.push(text);
        if (text.includes("insert into rate_limit_hit")) {
          const bucket = text.includes("slug-check") ? "slug-check" : "restaurant-create";
          db.attemptsByBucket[bucket] = (db.attemptsByBucket[bucket] ?? 0) + 1;
          return { rows: [] };
        }
        if (text.includes("count(*)::int as n from rate_limit_hit")) {
          const bucket = text.includes("slug-check") ? "slug-check" : "restaurant-create";
          return { rows: [{ n: db.attemptsByBucket[bucket] ?? 0 }] };
        }
        if (text.includes("create_restaurant_for_owner")) {
          db.createCalls++;
          if (db.createRefusal) {
            const refusal = new Error(db.createRefusal);
            if (!db.wrapRefusal) throw refusal;
            throw new DrizzleQueryError(
              "select create_restaurant_for_owner($1, $2, $3, $4, $5)",
              ["user-guest", "Daily Grind", "daily-grind", "Melville", "Johannesburg"],
              refusal,
            );
          }
          return { rows: [{ create_restaurant_for_owner: "ok" }] };
        }
        if (text.includes("select id from restaurant where slug")) {
          const taken = db.restaurantSlugs.some((slug) => text.includes(`"${slug}"`));
          return { rows: taken ? [{ id: "r-1" }] : [] };
        }
        if (text.includes("select slug, status::text as status from restaurant")) {
          return { rows: [{ slug: "daily-grind", status: db.restaurantStatus }] };
        }
        return { rows: [] };
      },
      transaction: async (inner: (tx: unknown) => Promise<unknown>) => inner(tx),
    };
    return cb(tx);
  },
}));

vi.mock("./db/mode", () => ({
  getDataMode: () => db.mode,
}));

const guest: Viewer = {
  userId: "user-guest",
  email: "guest@example.com",
  name: "New Owner",
  role: "guest",
  restaurantId: null,
  customerId: null,
  needsPhone: false,
} as Viewer;

const owner: Viewer = { ...guest, userId: "user-owner", role: "owner", restaurantId: "r-1" };
const staff: Viewer = { ...guest, userId: "user-staff", role: "manager", restaurantId: "r-1" };
const guestWithRestaurant: Viewer = { ...guest, userId: "user-half", restaurantId: "r-1" };

const good = { name: "Daily Grind", slug: "daily-grind", suburb: "Melville", city: "Johannesburg" };

beforeEach(() => {
  db.mode = "live";
  db.queries = [];
  db.restaurantSlugs = [];
  db.createRefusal = "";
  db.wrapRefusal = false;
  db.restaurantStatus = "draft";
  db.createCalls = 0;
  db.attemptsByBucket = {};
  process.env["DATABASE_URL"] = "postgres://mock:5432/db";
});

describe("slug rules", () => {
  it("accepts simple lowercase page addresses", () => {
    expect(slugProblem("daily-grind")).toBeNull();
    expect(slugProblem("cafe2")).toBeNull();
  });

  it("refuses short, long, badly formed and reserved addresses", () => {
    expect(slugProblem("ab")).not.toBeNull();
    expect(slugProblem("a".repeat(41))).not.toBeNull();
    expect(slugProblem("daily--grind")).not.toBeNull();
    expect(slugProblem("-daily")).not.toBeNull();
    expect(slugProblem("daily_grind")).not.toBeNull();
    expect(slugProblem("app")).toMatch(/reserved/);
  });
});

describe("signed-in checks", () => {
  it("refuses a signed out user", async () => {
    const result = await createRestaurantForGuest(null, good);
    expect(result).toEqual({ ok: false, message: "Sign in again." });
    expect(db.createCalls).toBe(0);
  });

  it("refuses an owner or staff member", async () => {
    for (const viewer of [owner, staff]) {
      const result = await createRestaurantForGuest(viewer, good);
      expect(result.ok).toBe(false);
    }
    expect(db.createCalls).toBe(0);
  });

  it("refuses a guest who already has a restaurant", async () => {
    const result = await createRestaurantForGuest(guestWithRestaurant, good);
    expect(result.ok).toBe(false);
    expect(db.createCalls).toBe(0);
  });

  it("refuses bad and reserved slugs before the database is touched", async () => {
    const bad = await createRestaurantForGuest(guest, { ...good, slug: "x" });
    const reserved = await createRestaurantForGuest(guest, { ...good, slug: "app" });
    expect(bad.ok).toBe(false);
    expect(reserved.ok).toBe(false);
    expect(db.createCalls).toBe(0);
  });

  it("gives the plain message when the page address is taken", async () => {
    db.createRefusal = "slug_taken";
    const result = await createRestaurantForGuest(guest, good);
    expect(result).toEqual({ ok: false, message: "That page address is taken. Try another." });
  });

  it("refuses the 4th create attempt in an hour", async () => {
    db.createRefusal = "slug_taken";
    for (let i = 0; i < RESTAURANT_CREATE_PER_HOUR; i++) {
      await createRestaurantForGuest(guest, good);
    }
    const fourth = await createRestaurantForGuest(guest, good);
    expect(fourth).toEqual({
      ok: false,
      message: "Too many attempts. Wait an hour and try again.",
    });
    expect(db.createCalls).toBe(RESTAURANT_CREATE_PER_HOUR);
  });

  it("limits slug checks per user", async () => {
    for (let i = 0; i < SLUG_CHECK_PER_HOUR; i++) {
      await checkSlug(guest, "daily-grind");
    }
    const next = await checkSlug(guest, "daily-grind");
    expect(next).toEqual({ ok: false, message: "Too many checks. Wait a little and try again." });
  });

  it("reports a taken address as taken and a free one as free", async () => {
    db.restaurantSlugs = ["daily-grind"];
    expect(await checkSlug(guest, "Daily-Grind")).toMatchObject({ ok: true, available: false });
    expect(await checkSlug(guest, "lekker-eats")).toMatchObject({ ok: true, available: true });
  });
});

describe("success", () => {
  it("returns only the slug on success", async () => {
    const result = await createRestaurantForGuest(guest, good);
    expect(result).toEqual({ ok: true, slug: "daily-grind" });
    expect(Object.keys(result).sort()).toEqual(["ok", "slug"]);
    expect(db.createCalls).toBe(1);
  });

  it("only the owner can read their own page address, and sees if it is published", async () => {
    expect(await loadMyRestaurant(guest)).toBeNull();
    expect(await loadMyRestaurant(owner)).toEqual({ slug: "daily-grind", published: false });
    db.restaurantStatus = "active";
    expect(await loadMyRestaurant(owner)).toEqual({ slug: "daily-grind", published: true });
    db.restaurantStatus = "paused";
    expect(await loadMyRestaurant(owner)).toEqual({ slug: "daily-grind", published: false });
  });
});

describe("demo mode", () => {
  it("refuses every create and check", async () => {
    db.mode = "demo";
    expect((await createRestaurantForGuest(guest, good)).ok).toBe(false);
    expect((await checkSlug(guest, "daily-grind")).ok).toBe(false);
    expect(await loadMyRestaurant(owner)).toBeNull();
    expect(db.createCalls).toBe(0);
  });
});

describe("error messages", () => {
  it("maps database refusal codes to plain sentences", () => {
    expect(plainCreateError(new Error("slug_taken"))).toMatch(/taken/);
    expect(plainCreateError(new Error("already_has_restaurant"))).toMatch(/already has/);
    expect(plainCreateError(new Error("something else"))).toMatch(/could not create/);
  });

  it("reads the refusal from inside the driver's wrapper, as the real driver delivers it", () => {
    const wrapped = new DrizzleQueryError(
      "select create_restaurant_for_owner($1, $2, $3, $4, $5)",
      ["user-guest", "Daily Grind", "daily-grind", "Melville", "Johannesburg"],
      new Error("slug_taken"),
    );
    expect(wrapped.message).not.toBe("slug_taken");
    expect(refusalCode(wrapped)).toBe("slug_taken");
    expect(plainCreateError(wrapped)).toMatch(/taken/);
  });

  it("does not take a code from the typed values or the query text", () => {
    // A restaurant called "slug_taken" must not be able to fake a refusal.
    const wrapped = new DrizzleQueryError(
      "select create_restaurant_for_owner($1, $2, $3, $4, $5)",
      ["user-guest", "slug_taken", "slug-taken", "bad_name", "Johannesburg"],
      new Error("connection terminated"),
    );
    expect(refusalCode(wrapped)).toBeNull();
    expect(plainCreateError(wrapped)).toMatch(/could not create/);
    expect(refusalCode(new Error("x slug_taken y"))).toBeNull();
    expect(refusalCode("slug_taken")).toBeNull();
  });

  it("gives the plain sentence end to end when the driver wraps the refusal", async () => {
    db.createRefusal = "slug_taken";
    db.wrapRefusal = true;
    const result = await createRestaurantForGuest(guest, good);
    expect(result).toEqual({ ok: false, message: "That page address is taken. Try another." });
  });
});

describe("migration 0013 text", () => {
  const sqlText = readFileSync("db/migrations/0013_create_restaurant_dev.sql", "utf8");

  it("defines a security definer function with a fixed search path", () => {
    expect(sqlText).toMatch(/create or replace function create_restaurant_for_owner/i);
    expect(sqlText).toMatch(/security definer/i);
    expect(sqlText).toMatch(/set search_path/i);
  });

  it("switches operator context on only for its own run and puts the caller's value back", () => {
    // A function level "set app.is_operator" is refused by Postgres for non superusers, and a
    // bare set_config would stay on for the caller's whole transaction. The function must
    // remember the caller's value and restore it before it returns.
    expect(sqlText).not.toMatch(/^\s*set\s+app\.is_operator/im);
    expect(sqlText).toMatch(
      /prior_operator\s+text\s*:=\s*current_setting\('app\.is_operator', true\)/i,
    );
    const on = sqlText.indexOf("set_config('app.is_operator', 'true', true)");
    const restore = sqlText.indexOf(
      "set_config('app.is_operator', coalesce(prior_operator, ''), true)",
    );
    const returned = sqlText.indexOf("return new_id");
    expect(on).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(on);
    expect(returned).toBeGreaterThan(restore);
  });

  it("revokes public execute and grants only the app role", () => {
    expect(sqlText).toMatch(
      /revoke all on function create_restaurant_for_owner\(text, text, text, text, text\) from public/i,
    );
    expect(sqlText).toMatch(
      /grant execute on function create_restaurant_for_owner\(text, text, text, text, text\) to app_user/i,
    );
  });

  it("does not let the caller choose role, plan, status or id", () => {
    const signature =
      sqlText.match(/create or replace function create_restaurant_for_owner\(([^)]*)\)/i)?.[1] ??
      "";
    expect(signature).not.toMatch(/role|plan|status|credit|\bid\b/i);
    expect(sqlText).toMatch(/'draft'/);
    expect(sqlText).toMatch(/'starter'/);
  });
});
