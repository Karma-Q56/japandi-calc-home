// @vitest-environment node
// Real-database check that the owner's campaign list carries the estimated cost.
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
import { loadCampaignList } from "@/server/live-dashboard";
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

describe.skipIf(!dbTestsEnabled)("owner campaign list (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let viewer: Viewer;

  beforeAll(async () => {
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    db = connect();
    const restaurant = await makeRestaurant(db.owner, fixtures, { name: "Campaign Cafe" });
    await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'true', true)`;
      await tx`
        insert into campaign (restaurant_id, name, code, message_body, audience, status, est_cost_cents, created_by)
        values (${restaurant.id}, 'Winter coffee', 'WINTER1', 'Come in this week.', '{"type":"everyone"}'::jsonb, 'scheduled', 35, 'owner')
      `;
    });
    viewer = {
      userId: "t-campaign-owner",
      email: "owner@example.test",
      name: "Owner",
      role: "owner",
      restaurantId: restaurant.id,
      customerId: null,
      needsPhone: false,
    };
  });

  afterAll(async () => {
    if (!db) return;
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("shows what a scheduled campaign is expected to cost", async () => {
    const list = await loadCampaignList(viewer);
    expect(list?.campaigns[0]?.estimatedCostCents).toBe(35);
  });
});
