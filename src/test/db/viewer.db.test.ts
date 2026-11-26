// @vitest-environment node
// Real-database checks for turning a new login into a guest, including a phone number that
// is already on someone else's card. Skipped unless DATABASE_URL_MIGRATE and
// DATABASE_URL_TEST are set. Never point these at production.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  newFixtures,
  phoneDigits,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";
import { ensureViewer } from "@/server/auth-viewer";

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

describe.skipIf(!dbTestsEnabled)("a new guest login (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  const stamp = Date.now();
  let other: { id: string; userId: string };
  let takenPhone = "";

  const login = (label: string, phoneNumber: string | null) => {
    const id = `t-viewer-${label}-${stamp}`;
    fixtures.users.push(id);
    const email = `${id}@example.test`;
    return ensureViewer({ id, email, name: "New Person", phoneNumber }, email);
  };
  const customer = async (id: string) => {
    const rows = await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'true', true)`;
      return tx`select user_id, name, phone_e164 from customer where id = ${id}`;
    });
    return rows[0];
  };
  const freePhone = () => `+2782${phoneDigits().slice(-7)}`;

  beforeAll(async () => {
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    db = connect();
    other = await makeGuest(db.owner, fixtures);
    takenPhone = (await customer(other.id))?.["phone_e164"] as string;
  });

  afterAll(async () => {
    if (!db) return;
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("makes a card holder for a free number", async () => {
    const viewer = await login("free", freePhone());
    expect(viewer.needsPhone).toBe(false);
    expect(viewer.customerId).toBeTruthy();
    fixtures.customers.push(viewer.customerId!);
  });

  it("never links a login to a card that holds the same number", async () => {
    const before = await customer(other.id);
    const viewer = await login("taken", takenPhone);
    expect(viewer).toMatchObject({ customerId: null, needsPhone: true, phoneTaken: true });
    expect(await customer(other.id)).toEqual(before);
    // Asking again gives the same answer rather than failing.
    const again = await login("taken", takenPhone);
    expect(again).toMatchObject({ customerId: null, phoneTaken: true });
  });

  it("makes the card once a free number is given", async () => {
    const phone = freePhone();
    const viewer = await login("taken", phone);
    expect(viewer.needsPhone).toBe(false);
    fixtures.customers.push(viewer.customerId!);
    expect((await customer(viewer.customerId!))?.["phone_e164"]).toBe(phone);
  });

  it("gives nothing to a new login that reuses another account's email", async () => {
    const first = await login("owner", freePhone());
    fixtures.customers.push(first.customerId!);
    const id = `t-viewer-copy-${stamp}`;
    fixtures.users.push(id);
    const copy = await ensureViewer(
      { id, email: first.email, name: "Copy", phoneNumber: freePhone() },
      first.email,
    );
    expect(copy).toMatchObject({ role: "guest", customerId: null, restaurantId: null });
    expect(await login("owner", null)).toMatchObject({ customerId: first.customerId });
  });

  it("keeps a very long or empty name within what a card allows", async () => {
    const id = `t-viewer-name-${stamp}`;
    fixtures.users.push(id);
    const email = `${id}@example.test`;
    const viewer = await ensureViewer(
      { id, email, name: "x".repeat(200), phoneNumber: freePhone() },
      email,
    );
    fixtures.customers.push(viewer.customerId!);
    expect((await customer(viewer.customerId!))?.["name"]).toHaveLength(80);
  });

  it("lets a login that started without a number finish later", async () => {
    expect(await login("later", null)).toMatchObject({ customerId: null, needsPhone: true });
    expect(await login("later", null)).toMatchObject({ customerId: null, needsPhone: true });
    const done = await login("later", freePhone());
    expect(done.needsPhone).toBe(false);
    fixtures.customers.push(done.customerId!);
  });
});
