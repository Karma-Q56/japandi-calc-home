// @vitest-environment node
// Real-database check that an owner can load and save Settings as the restricted app login.
// Skipped unless DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point at production.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";
import { getOwnerSettings, saveOwnerSettings } from "@/server/live-admin";
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

describe.skipIf(!dbTestsEnabled)("owner settings (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let viewer: Viewer;
  const userId = `t-settings-${Date.now()}`;

  beforeAll(async () => {
    process.env["DATA_MODE"] = "live";
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    db = connect();
    const restaurant = await makeRestaurant(db.owner, fixtures, { name: "Settings Cafe" });
    await db.owner`
      insert into app_user (user_id, email, role, restaurant_id)
      values (${userId}, ${`${userId}@example.test`}, 'owner', ${restaurant.id})
    `;
    viewer = {
      userId,
      email: `${userId}@example.test`,
      name: "Owner",
      role: "owner",
      restaurantId: restaurant.id,
      customerId: null,
      needsPhone: false,
    };
  });

  afterAll(async () => {
    delete process.env["DATA_MODE"];
    delete process.env["DATABASE_URL"];
    if (!db) return;
    await db.owner`delete from app_user where user_id = ${userId}`;
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("loads the owner's own settings", async () => {
    expect((await getOwnerSettings(viewer))?.name).toBe("Settings Cafe");
  });

  it("saves a change and reads it back", async () => {
    const current = (await getOwnerSettings(viewer))!;
    const saved = await saveOwnerSettings(viewer, { ...current, name: "Settings Cafe Two" });
    expect(saved).toEqual({ ok: true, value: null });
    expect((await getOwnerSettings(viewer))?.name).toBe("Settings Cafe Two");
  });

  it("gives nothing to a guest", async () => {
    expect(await getOwnerSettings({ ...viewer, role: "guest" })).toBeNull();
  });
});
