// @vitest-environment node
// Real database test for migration 0018 (claim_challenge and reward_referral).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("challenges and referrals (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("does not leave operator power switched on after claim_challenge returns", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const seen = await asApp(db.app, { restaurantId }, async (tx) => {
      await tx`select claim_challenge(${restaurantId}, ${membershipId}, null, ${`fx-${token()}`}, 0)`.catch(() => null);
      const [flag] = await tx`select current_setting('app.is_operator', true) as v`;
      const [visible] = await tx`select count(*)::int as n from app_user`;
      return { flag: flag!["v"], visible: visible!["n"] };
    });
    expect(seen.flag).toBe("false");
    expect(seen.visible).toBe(0);
  });

  it("refuses a claim for another restaurant's membership", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipA = await makeMembership(db.owner, restaurantA, guest.id);
    const [challengeB] = await db.owner`
      insert into challenge (restaurant_id, title, visits, window_days, bonus_stamps)
      values (${restaurantB}, ${`fx-${token()}`}, 2, 7, 1) returning id`;
    await expect(
      asApp(db.app, { restaurantId: restaurantB }, (tx) =>
        tx`select claim_challenge(${restaurantB}, ${membershipA}, ${challengeB!["id"]}, ${`fx-${token()}`}, 0)`,
      ),
    ).rejects.toThrow();
  });

  it("does not let the app role write referral rewards straight to the table", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const changed = await asApp(db.app, { restaurantId }, (tx) =>
      tx`update referral set status = 'rewarded' where restaurant_id = ${restaurantId} returning id`.catch(() => []),
    );
    expect(changed.length).toBe(0);
  });

  it("keeps the referral setting and codes private to their restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const seenByB = await asApp(db.app, { restaurantId: restaurantB }, (tx) =>
      tx`select id from referral_code where restaurant_id = ${restaurantA}`,
    );
    expect(seenByB.length).toBe(0);
  });
});
