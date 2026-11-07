// @vitest-environment node
// Real-database checks for migration 0016 (reward types). Skipped unless DATABASE_URL_MIGRATE
// and DATABASE_URL_TEST are set. Never point these at production.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, dbTestsEnabled, type DbConnections } from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("0016 reward types (real database)", () => {
  let db: DbConnections;

  beforeAll(() => {
    db = connect();
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("refuses a reward whose value does not match its kind", async () => {
    await expect(
      db.owner`
        insert into reward (restaurant_id, membership_id, description, kind, percent_off, amount_off_cents)
        select m.restaurant_id, m.id, 'bad', 'percent_off', null, null
        from membership m limit 1
      `,
    ).rejects.toThrow();
  });

  it("refuses a restaurant reward with a percentage above 100", async () => {
    await expect(
      db.owner`
        update restaurant set reward_kind = 'percent_off', reward_percent_off = 101
        where id = (select id from restaurant limit 1)
      `,
    ).rejects.toThrow();
  });

  it("refuses a reward validity outside 1 to 365 days", async () => {
    await expect(
      db.owner`
        update restaurant set reward_valid_days = 0
        where id = (select id from restaurant limit 1)
      `,
    ).rejects.toThrow();
  });

  it("does not let app_user run grant_reward directly", async () => {
    await expect(
      db.app`select grant_reward(gen_random_uuid(), gen_random_uuid(), 'free_item', 'x', null, null, 'stamp_card', null, null)`,
    ).rejects.toThrow();
  });

  it("restores the operator setting after grant_reward runs", async () => {
    await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'false', true)`;
      await tx`select grant_reward(gen_random_uuid(), gen_random_uuid(), 'free_item', 'x', null, null, 'stamp_card', null, null)`.catch(() => null);
      const [row] = await tx<{ value: string }[]>`select current_setting('app.is_operator', true) as value`;
      expect(row?.value).toBe("false");
    });
  });
});
