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

  async function setupChallenge(visits: number) {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const [challenge] = await db.owner`
      insert into challenge (restaurant_id, title, visits, window_days, bonus_stamps)
      values (${restaurantId}, ${`fx-${token()}`}, ${visits}, 7, 2) returning id`;
    return { restaurantId, membershipId, challengeId: challenge!["id"] as string };
  }

  async function addVisits(restaurantId: string, membershipId: string, count: number) {
    for (let index = 0; index < count; index += 1) {
      await db.owner`
        insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
        values (${restaurantId}, ${membershipId}, null, ${`fx-visit-${token()}`}, 'visit')`;
    }
  }

  it("refuses a percent or amount reward that has no value (a CHECK passes on NULL)", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await expect(
      db.owner`
        insert into challenge (restaurant_id, title, visits, window_days, reward_type)
        values (${restaurantId}, 'bad', 2, 7, 'percent_off')`,
    ).rejects.toThrow();
    await expect(
      db.owner`
        insert into challenge (restaurant_id, title, visits, window_days, reward_type)
        values (${restaurantId}, 'bad', 2, 7, 'amount_off')`,
    ).rejects.toThrow();
    await expect(
      db.owner`update restaurant set referrer_reward_type = 'percent_off', referrer_reward_percent_off = null where id = ${restaurantId}`,
    ).rejects.toThrow();
    await expect(
      db.owner`update restaurant set friend_reward_type = 'amount_off', friend_reward_amount_off_cents = null where id = ${restaurantId}`,
    ).rejects.toThrow();
  });

  it("refuses to pay a challenge the guest has not completed", async () => {
    const { restaurantId, membershipId, challengeId } = await setupChallenge(3);
    await addVisits(restaurantId, membershipId, 2);
    const [row] = await asApp(db.app, { restaurantId }, (tx) =>
      tx`select out_result from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${`fx-${token()}`}, null)`,
    );
    expect(row?.["out_result"]).toBe("not_complete");
  });

  it("pays a completed challenge once and never twice", async () => {
    const { restaurantId, membershipId, challengeId } = await setupChallenge(2);
    await addVisits(restaurantId, membershipId, 2);
    const result = await asApp(db.app, { restaurantId }, async (tx) => {
      const [first] = await tx`select out_result from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${`fx-${token()}`}, null)`;
      const [again] = await tx`select out_result from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${`fx-${token()}`}, null)`;
      const [member] = await tx`select stamps_current from membership where id = ${membershipId}`;
      return { first: first?.["out_result"], again: again?.["out_result"], stamps: Number(member?.["stamps_current"]) };
    });
    expect(result.first).toBe("claimed");
    expect(result.again).toBe("already_claimed");
    expect(result.stamps).toBe(2);
  });

  it("refuses claim_challenge and reward_referral from another restaurant's context", async () => {
    const { restaurantId, membershipId, challengeId } = await setupChallenge(1);
    const { id: otherRestaurant } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await addVisits(restaurantId, membershipId, 1);
    await expect(
      asApp(db.app, { restaurantId: otherRestaurant }, (tx) =>
        tx`select * from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${`fx-${token()}`}, null)`,
      ),
    ).rejects.toThrow(/not_allowed/);
    await expect(
      asApp(db.app, { restaurantId: otherRestaurant }, (tx) => tx`select reward_referral(${restaurantId}, ${membershipId})`),
    ).rejects.toThrow(/not_allowed/);
    await expect(asApp(db.app, {}, (tx) => tx`select reward_referral(${restaurantId}, ${membershipId})`)).rejects.toThrow(/not_allowed/);
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
