// @vitest-environment node
// Real-database checks for migration 0017 (bonus rules and tiers). Skipped unless
// DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point these at production.
// Visit stamps use explicit timestamps so the result does not depend on the day or hour.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, dbTestsEnabled, type DbConnections } from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("0017 bonus rules and tiers (real database)", () => {
  let db: DbConnections;

  beforeAll(() => {
    db = connect();
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("refuses a tier pair where VIP is not above Regular", async () => {
    await expect(
      db.owner`
        update restaurant set tiers = '{"regular": 8, "vip": 8}'::jsonb
        where id = (select id from restaurant limit 1)
      `,
    ).rejects.toThrow();
  });

  it("refuses a streak setting outside 2 to 12 weeks", async () => {
    await expect(
      db.owner`
        update restaurant set streak_enabled = true, streak_weeks = 13
        where id = (select id from restaurant limit 1)
      `,
    ).rejects.toThrow();
  });

  it("refuses a bonus budget above 2000", async () => {
    await expect(
      db.owner`
        update restaurant set tool_stamp_budget = 2001
        where id = (select id from restaurant limit 1)
      `,
    ).rejects.toThrow();
  });

  it("does not let app_user run apply_visit_bonuses directly", async () => {
    await expect(
      db.app`select apply_visit_bonuses(gen_random_uuid(), gen_random_uuid())`,
    ).rejects.toThrow();
  });

  it("does not let app_user run apply_birthday_and_mystery directly", async () => {
    await expect(
      db.app`select apply_birthday_and_mystery(gen_random_uuid(), gen_random_uuid())`,
    ).rejects.toThrow();
  });

  it("restores the operator setting after apply_visit_bonuses runs", async () => {
    await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'false', true)`;
      await tx`select apply_visit_bonuses(gen_random_uuid(), gen_random_uuid())`.catch(() => null);
      const [row] = await tx<{ value: string }[]>`select current_setting('app.is_operator', true) as value`;
      expect(row?.value).toBe("false");
    });
  });
});
