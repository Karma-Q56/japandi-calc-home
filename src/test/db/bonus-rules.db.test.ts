// @vitest-environment node
// Real-database checks for migration 0017 (bonus rules and tiers). Skipped unless
// DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point these at production.
// Every test builds its own restaurant, so it also passes on a fresh, empty database.
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

describe.skipIf(!dbTestsEnabled)("0017 bonus rules and tiers (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let restaurantA: string;
  let restaurantB: string;
  let membershipA: string;

  beforeAll(async () => {
    db = connect();
    restaurantA = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    restaurantB = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    const guest = await makeGuest(db.owner, fixtures);
    membershipA = await makeMembership(db.owner, restaurantA, guest.id);
  });

  afterAll(async () => {
    if (db) {
      await cleanup(db.owner, fixtures);
      await db.close();
    }
  });

  it("refuses a tier pair where VIP is not above Regular", async () => {
    await expect(
      db.owner`update restaurant set tiers = '{"regular": 8, "vip": 8}'::jsonb where id = ${restaurantA}`,
    ).rejects.toThrow();
  });

  it("refuses a streak setting outside 2 to 12 weeks", async () => {
    await expect(
      db.owner`update restaurant set streak_enabled = true, streak_weeks = 13 where id = ${restaurantA}`,
    ).rejects.toThrow();
  });

  it("refuses a bonus budget above 2000", async () => {
    await expect(
      db.owner`update restaurant set tool_stamp_budget = 2001 where id = ${restaurantA}`,
    ).rejects.toThrow();
  });

  it("refuses a call with no restaurant context", async () => {
    await expect(
      asApp(db.app, {}, (tx) => tx`select apply_visit_bonuses(${membershipA}, gen_random_uuid())`),
    ).rejects.toThrow(/not_allowed/);
    await expect(
      asApp(db.app, {}, (tx) => tx`select apply_birthday_and_mystery(${membershipA}, gen_random_uuid())`),
    ).rejects.toThrow(/not_allowed/);
  });

  it("refuses a call made from another restaurant's context", async () => {
    await expect(
      asApp(
        db.app,
        { restaurantId: restaurantB },
        (tx) => tx`select apply_visit_bonuses(${membershipA}, gen_random_uuid())`,
      ),
    ).rejects.toThrow(/not_allowed/);
    await expect(
      asApp(
        db.app,
        { restaurantId: restaurantB },
        (tx) => tx`select apply_birthday_and_mystery(${membershipA}, gen_random_uuid())`,
      ),
    ).rejects.toThrow(/not_allowed/);
  });

  it("allows the call from the guest's own restaurant and pays nothing when no rule applies", async () => {
    const [bonus] = await asApp(
      db.app,
      { restaurantId: restaurantA },
      (tx) => tx`select apply_visit_bonuses(${membershipA}, gen_random_uuid()) as n`,
    );
    expect(bonus?.["n"]).toBe(0);
    const [other] = await asApp(
      db.app,
      { restaurantId: restaurantA },
      (tx) => tx`select apply_birthday_and_mystery(${membershipA}, gen_random_uuid()) as n`,
    );
    expect(other?.["n"]).toBe(0);
  });

  it("restores the operator setting after the bonus functions run", async () => {
    await asApp(db.app, { restaurantId: restaurantA, operator: false }, async (tx) => {
      await tx`select apply_visit_bonuses(${membershipA}, gen_random_uuid())`;
      await tx`select apply_birthday_and_mystery(${membershipA}, gen_random_uuid())`;
      const [row] = await tx<{ value: string }[]>`select current_setting('app.is_operator', true) as value`;
      expect(row?.value).toBe("false");
    });
  });
});
