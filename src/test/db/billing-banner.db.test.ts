// @vitest-environment node
// Real database test for the owner billing banner (D25). The banner is worked out in TypeScript
// and sending is blocked in SQL (billing_paused, migration 0038). Both must give the same answer,
// or an owner sees "all fine" while sending is blocked, or the other way round. This test sets up
// each situation in the database and compares the banner with billing_paused.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getLiveBillingBanner } from "../../server/live-billing";
import {
  appUrl,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

// Same stand-in for the Neon driver as the campaign tests: real SQL and row security, as app_user.
vi.mock("../../server/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  return {
    withContext: async (
      context: { databaseUrl: string; restaurantId?: string | null; customerId?: string | null; isOperator?: boolean },
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const client = postgres(context.databaseUrl, { max: 1, prepare: false });
      try {
        const database = drizzle(client);
        return await database.transaction(async (transaction) => {
          await transaction.execute(sql`
            select
              set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
              set_config('app.customer_id', ${context.customerId ?? ""}, true),
              set_config('app.is_operator', ${context.isOperator ? "true" : "false"}, true)
          `);
          const shaped = {
            execute: async (query: unknown) => ({ rows: await transaction.execute(query as never) }),
          };
          return callback(shaped as never);
        });
      } finally {
        await client.end();
      }
    },
  };
});

const savedEnv = { DATA_MODE: process.env["DATA_MODE"], DATABASE_URL: process.env["DATABASE_URL"] };

describe.skipIf(!dbTestsEnabled)("billing banner agrees with billing_paused (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
    process.env["DATA_MODE"] = "live";
    process.env["DATABASE_URL"] = appUrl;
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
    process.env["DATA_MODE"] = savedEnv.DATA_MODE;
    process.env["DATABASE_URL"] = savedEnv.DATABASE_URL;
  });

  async function owner() {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    return restaurantId;
  }
  const viewer = (restaurantId: string) => ({ userId: "x", role: "owner", restaurantId }) as never;
  const sqlPaused = async (restaurantId: string) => {
    const [row] = await db.owner<{ p: boolean }[]>`select billing_paused(${restaurantId}::uuid) as p`;
    return row!.p;
  };

  async function subscription(restaurantId: string, state: string, graceOffset: string | null, dueOffset: string | null) {
    await db.owner`
      insert into subscription (restaurant_id, plan, state, grace_ends_at, next_due_at, past_due_since)
      values (${restaurantId}, 'managed', ${state},
              ${graceOffset ? db.owner`now() + ${graceOffset}::interval` : null},
              ${dueOffset ? db.owner`now() + ${dueOffset}::interval` : null},
              ${state === "past_due" ? db.owner`now() - interval '2 days'` : null})`;
  }

  it("shows nothing for a restaurant with no monthly plan and no invoices, and for a guest", async () => {
    const restaurantId = await owner();
    expect(await getLiveBillingBanner(viewer(restaurantId))).toEqual({ kind: "none", graceEndsAt: null });
    expect(await sqlPaused(restaurantId)).toBe(false);
    expect(await getLiveBillingBanner({ userId: "g", role: "guest", restaurantId: null } as never)).toEqual({ kind: "none", graceEndsAt: null });
  });

  it("shows the grace warning inside the 7 days and the paused banner after, in step with the database", async () => {
    const inGrace = await owner();
    await subscription(inGrace, "past_due", "5 days", "-2 days");
    const grace = await getLiveBillingBanner(viewer(inGrace));
    expect(grace.kind).toBe("grace");
    expect(grace.graceEndsAt).not.toBeNull();
    expect(await sqlPaused(inGrace)).toBe(false);

    const lapsed = await owner();
    await subscription(lapsed, "past_due", "-1 hour", "-9 days");
    expect((await getLiveBillingBanner(viewer(lapsed))).kind).toBe("paused");
    expect(await sqlPaused(lapsed)).toBe(true);
  });

  it("treats a cancelled plan like the database: paused only after its paid-up date", async () => {
    const paidUp = await owner();
    await subscription(paidUp, "cancelled", null, "10 days");
    expect((await getLiveBillingBanner(viewer(paidUp))).kind).toBe("none");
    expect(await sqlPaused(paidUp)).toBe(false);

    const ended = await owner();
    await subscription(ended, "cancelled", null, "-1 day");
    expect((await getLiveBillingBanner(viewer(ended))).kind).toBe("paused");
    expect(await sqlPaused(ended)).toBe(true);
  });

  it("counts an overdue invoice by whole days exactly as the database does", async () => {
    for (const daysLate of [0, 3, 7, 8, 30]) {
      const restaurantId = await owner();
      await db.owner`
        insert into invoice (restaurant_id, amount_cents, description, status, due_date)
        values (${restaurantId}, 50000, 'Set up fee', 'open', current_date - ${daysLate}::int)`;
      const banner = await getLiveBillingBanner(viewer(restaurantId));
      const expected = await sqlPaused(restaurantId);
      expect(banner.kind === "paused", `${daysLate} days late`).toBe(expected);
      expect(expected, `${daysLate} days late`).toBe(daysLate > 7);
    }
  });

  it("never shows a banner for a paid or void invoice", async () => {
    const restaurantId = await owner();
    await db.owner`
      insert into invoice (restaurant_id, amount_cents, description, status, due_date) values
        (${restaurantId}, 50000, 'Paid one', 'paid', current_date - 40),
        (${restaurantId}, 50000, 'Void one', 'void', current_date - 40)`;
    expect((await getLiveBillingBanner(viewer(restaurantId))).kind).toBe("none");
    expect(await sqlPaused(restaurantId)).toBe(false);
  });
});
