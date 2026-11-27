// @vitest-environment node
// Real-database checks for a signed-in guest adding a card. Skipped unless
// DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point these at production.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";
import { joinForViewer } from "@/server/live-join";
import type { Viewer } from "@/server/auth-viewer";

// Same stand-in for the Neon driver as the campaign tests: real SQL and row security, as app_user.
vi.mock("../../server/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  return {
    withContext: async (
      context: { databaseUrl: string; restaurantId?: string | null; isOperator?: boolean },
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const client = postgres(context.databaseUrl, { max: 1, prepare: false });
      try {
        return await drizzle(client).transaction(async (transaction) => {
          await transaction.execute(sql`
            select
              set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
              set_config('app.customer_id', '', true),
              set_config('app.is_operator', ${context.isOperator ? "true" : "false"}, true)
          `);
          return callback({
            execute: async (query: unknown) => ({
              rows: await transaction.execute(query as never),
            }),
          });
        });
      } finally {
        await client.end();
      }
    },
  };
});

describe.skipIf(!dbTestsEnabled)("joining a card with a login (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let venue: { id: string; slug: string };
  let guest: Viewer;

  const viewer = (customerId: string | null, role: Viewer["role"] = "guest"): Viewer => ({
    userId: "t-join",
    email: "join@example.test",
    name: "Join Guest",
    role,
    restaurantId: null,
    customerId,
    needsPhone: customerId === null,
  });
  const asOwner = <T>(work: (tx: DbConnections["owner"]) => PromiseLike<T>) =>
    db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'true', true)`;
      return work(tx as unknown as DbConnections["owner"]);
    });
  const join = (who: Viewer | null, slug = venue.slug) =>
    joinForViewer(who, { slug, marketingSms: true, source: "table-1" });

  beforeAll(async () => {
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    process.env["DATA_MODE"] = "live";
    db = connect();
    venue = await makeRestaurant(db.owner, fixtures, { name: "Join Cafe" });
    await asOwner(
      (tx) =>
        tx`update restaurant set status = 'active', stamps_required = 5, welcome_stamps = 1 where id = ${venue.id}`,
    );
    guest = viewer((await makeGuest(db.owner, fixtures)).id);
  });

  afterAll(async () => {
    if (!db) return;
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("refuses visitors, restaurant logins and logins without a number", async () => {
    expect(await join(null)).toMatchObject({ ok: false });
    expect(await join(viewer(guest.customerId, "owner"))).toMatchObject({ ok: false });
    expect(await join(viewer(null))).toMatchObject({ ok: false });
  });

  it("makes one card for the session's own guest, even when tapped twice at once", async () => {
    const results = await Promise.all([join(guest), join(guest)]);
    expect(results.every((result) => result.ok)).toBe(true);
    const cards = await asOwner(
      (tx) => tx`
        select id, stamps_current, marketing_sms, source from membership
        where restaurant_id = ${venue.id} and customer_id = ${guest.customerId}`,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stamps_current: 1, source: "table-1" });
    const consents = await asOwner(
      (tx) => tx`select purpose from consent_event where membership_id = ${cards[0]!["id"]}`,
    );
    expect(consents.map((row) => row["purpose"]).sort()).toEqual(["loyalty", "marketing_sms"]);
  });

  it("refuses a restaurant that is not open to the public", async () => {
    const hidden = await makeRestaurant(db.owner, fixtures, { name: "Draft Cafe" });
    await asOwner((tx) => tx`update restaurant set status = 'draft' where id = ${hidden.id}`);
    expect(await join(guest, hidden.slug)).toMatchObject({
      ok: false,
      message: "We could not find that restaurant.",
    });
  });
});
