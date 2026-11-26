// @vitest-environment node
// Real-database checks for saves that send a list of values (challenge weekdays, saved guest
// lists). Both failed in live mode because the list was spread into separate values.
// Skipped unless DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point at production.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";
import { listChallenges, saveChallenge } from "@/server/live-challenges";
import { createSavedList, listSavedLists } from "@/server/live-lists";
import type { Viewer } from "@/server/auth-viewer";
import type { LiveChallengeInput } from "@/lib/live-challenges";

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

describe.skipIf(!dbTestsEnabled)("saving lists of values (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let viewer: Viewer;
  const members: string[] = [];

  const challenge: LiveChallengeInput = {
    title: "Three visits",
    kind: "visits",
    visits: 3,
    windowDays: 30,
    weekdays: [],
    startHour: null,
    endHour: null,
    menuItemId: null,
    menuSectionId: null,
    targetName: "",
    rewardType: "stamps",
    bonusStamps: 1,
    rewardItem: "",
    percentOff: null,
    amountOffCents: null,
    validDays: null,
    active: true,
  };

  beforeAll(async () => {
    process.env["DATA_MODE"] = "live";
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    db = connect();
    const restaurant = await makeRestaurant(db.owner, fixtures);
    for (let i = 0; i < 2; i += 1) {
      const guest = await makeGuest(db.owner, fixtures);
      members.push(await makeMembership(db.owner, restaurant.id, guest.id));
    }
    viewer = {
      userId: "t-list-owner",
      email: "t-list-owner@example.test",
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
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("saves a visit challenge with no weekdays", async () => {
    expect(await saveChallenge(viewer, null, challenge)).toEqual({ ok: true });
  });

  it("saves a quiet-day challenge, then changes its weekdays", async () => {
    const quiet: LiveChallengeInput = {
      ...challenge,
      title: "Quiet days",
      kind: "quiet_days",
      weekdays: [1, 2],
      startHour: 14,
      endHour: 17,
    };
    expect(await saveChallenge(viewer, null, quiet)).toEqual({ ok: true });
    const saved = (await listChallenges(viewer))!.find((item) => item.title === "Quiet days")!;
    expect(saved.weekdays).toEqual([1, 2]);
    expect(await saveChallenge(viewer, saved.id, { ...quiet, weekdays: [3] })).toEqual({
      ok: true,
    });
    const changed = (await listChallenges(viewer))!.find((item) => item.id === saved.id)!;
    expect(changed.weekdays).toEqual([3]);
  });

  it("creates an empty guest list and one with guests", async () => {
    expect((await createSavedList(viewer, "Empty", [])).ok).toBe(true);
    expect((await createSavedList(viewer, "Both", members)).ok).toBe(true);
    const lists = (await listSavedLists(viewer))!;
    expect(lists.map((list) => list.name).sort()).toEqual(["Both", "Empty"]);
    expect(JSON.stringify(lists.find((list) => list.name === "Both"))).toContain("2");
  });
});
