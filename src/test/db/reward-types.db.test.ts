// @vitest-environment node
// Real-database checks for migration 0016 (reward types). Skipped unless DATABASE_URL_MIGRATE
// and DATABASE_URL_TEST are set. Never point these at production.
// Every test builds its own restaurant and guest, so it also passes on a fresh, empty database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
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

describe.skipIf(!dbTestsEnabled)("0016 reward types (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let restaurantId: string;
  let otherRestaurantId: string;
  let membershipId: string;

  beforeAll(async () => {
    db = connect();
    restaurantId = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    otherRestaurantId = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    const guest = await makeGuest(db.owner, fixtures);
    membershipId = await makeMembership(db.owner, restaurantId, guest.id);
  });

  afterAll(async () => {
    if (db) {
      await cleanup(db.owner, fixtures);
      await db.close();
    }
  });

  it("refuses a reward whose value does not match its kind", async () => {
    await expect(
      db.owner`
        insert into reward (restaurant_id, membership_id, description, kind, percent_off, amount_off_cents)
        values (${restaurantId}, ${membershipId}, 'bad', 'percent_off', null, null)
      `,
    ).rejects.toThrow();
  });

  it("refuses a reward of kind amount_off with no amount, and a restaurant reward with no value", async () => {
    await expect(
      db.owner`
        insert into reward (restaurant_id, membership_id, description, kind)
        values (${restaurantId}, ${membershipId}, 'bad', 'amount_off')
      `,
    ).rejects.toThrow();
    await expect(
      db.owner`update restaurant set reward_kind = 'percent_off', reward_percent_off = null where id = ${restaurantId}`,
    ).rejects.toThrow();
  });

  it("refuses a restaurant reward with a percentage above 100", async () => {
    await expect(
      db.owner`
        update restaurant set reward_kind = 'percent_off', reward_percent_off = 101
        where id = ${restaurantId}
      `,
    ).rejects.toThrow();
  });

  it("refuses a reward validity outside 1 to 365 days", async () => {
    await expect(
      db.owner`update restaurant set reward_valid_days = 0 where id = ${restaurantId}`,
    ).rejects.toThrow();
    await expect(
      db.owner`update restaurant set reward_valid_days = 366 where id = ${restaurantId}`,
    ).rejects.toThrow();
  });

  it("does not let app_user run grant_reward directly", async () => {
    await expect(
      asApp(
        db.app,
        { restaurantId },
        (tx) =>
          tx`select grant_reward(${restaurantId}, ${membershipId}, 'free_item', 'x', null, null, 'stamp_card', null, null)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses a reward for a guest who is not a member of that restaurant", async () => {
    await expect(
      db.owner`select grant_reward(${otherRestaurantId}, ${membershipId}, 'free_item', 'x', null, null, 'stamp_card', null, null)`,
    ).rejects.toThrow(/not_a_member/);
  });

  it("creates the reward and restores the operator setting afterwards", async () => {
    await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'false', true)`;
      const [granted] = await tx<{ id: string }[]>`
        select grant_reward(${restaurantId}, ${membershipId}, 'percent_off', '10% off', 10::smallint, null, 'stamp_card', null, 30::smallint) as id
      `;
      expect(granted?.id).toBeTruthy();
      const [row] = await tx<{ value: string }[]>`select current_setting('app.is_operator', true) as value`;
      expect(row?.value).toBe("false");
      const [reward] = await tx<{ kind: string; percent_off: number }[]>`
        select kind, percent_off from reward where id = ${granted!.id}
      `;
      expect(reward).toMatchObject({ kind: "percent_off", percent_off: 10 });
      throw new Error("rollback");
    }).catch((error: Error) => {
      if (error.message !== "rollback") throw error;
    });
  });
});
