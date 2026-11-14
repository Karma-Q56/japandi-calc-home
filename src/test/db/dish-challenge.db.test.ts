// @vitest-environment node
// Real database test for migration 0021 ("Try this dish"). Runs on GitHub for every push.
// Skips on a laptop unless both database addresses are set.
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
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("try this dish (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function makeMenu(restaurantId: string) {
    const [section] = await db.owner`
      insert into menu_section (restaurant_id, name, sort_order)
      values (${restaurantId}, ${`fx-${token()}`}, 0) returning id`;
    const sectionId = section!["id"] as string;
    const [chicken] = await db.owner`
      insert into menu_item (restaurant_id, section_id, name, price_cents, available, sort_order)
      values (${restaurantId}, ${sectionId}, 'Peri-peri chicken', 9500, true, 0) returning id`;
    const [wrap] = await db.owner`
      insert into menu_item (restaurant_id, section_id, name, price_cents, available, sort_order)
      values (${restaurantId}, ${sectionId}, 'Chicken wrap', 6500, true, 1) returning id`;
    return { sectionId, chickenId: chicken!["id"] as string, wrapId: wrap!["id"] as string };
  }

  async function makeOrder(restaurantId: string, membershipId: string, items: Array<[string, number]>, daysAgo = 0) {
    const [stamp] = await db.owner`
      insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason, created_at)
      values (${restaurantId}, ${membershipId}, null, ${`fx-visit-${token()}`}, 'visit',
              now() - make_interval(days => ${daysAgo}))
      returning id`;
    for (const [menuItemId, quantity] of items) {
      await db.owner`
        insert into visit_item (restaurant_id, stamp_event_id, menu_item_id, quantity)
        values (${restaurantId}, ${stamp!["id"]}, ${menuItemId}, ${quantity})`;
    }
  }

  async function makeTryChallenge(
    restaurantId: string,
    target: { menuItemId?: string; menuSectionId?: string },
    visits = 2,
    rewardType = "stamps",
  ) {
    const [row] = await db.owner`
      insert into challenge (restaurant_id, title, kind, visits, window_days, bonus_stamps, reward_type,
                             menu_item_id, menu_section_id, reward_percent_off, reward_amount_off_cents,
                             reward_item, created_at)
      values (${restaurantId}, ${`fx-${token()}`}, 'try_item', ${visits}, 30, 2, ${rewardType},
              ${target.menuItemId ?? null}, ${target.menuSectionId ?? null},
              ${rewardType === "percent_off" ? 10 : null},
              ${rewardType === "amount_off" ? 2000 : null},
              ${rewardType === "free_item" ? "Free side" : null},
              now() - interval '2 days')
      returning id`;
    return row!["id"] as string;
  }

  async function progressOf(restaurantId: string, membershipId: string, challengeId: string) {
    const [row] = await asApp(db.app, { restaurantId }, (tx) =>
      tx`select challenge_progress(${challengeId}, ${membershipId}) as p`,
    );
    return Number(row!["p"]);
  }

  it("counts only the chosen dish, ignores earlier orders and other restaurants", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: otherId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const otherMembership = await makeMembership(db.owner, otherId, guest.id);
    const menu = await makeMenu(restaurantId);
    const otherMenu = await makeMenu(otherId);
    const challengeId = await makeTryChallenge(restaurantId, { menuItemId: menu.chickenId });

    await makeOrder(restaurantId, membershipId, [[menu.wrapId, 1]]);
    await makeOrder(restaurantId, membershipId, [[menu.chickenId, 1]]);
    await makeOrder(otherId, otherMembership, [[otherMenu.chickenId, 3]]);
    expect(await progressOf(restaurantId, membershipId, challengeId)).toBe(1);
  });

  it("does not count orders made before the challenge started", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const menu = await makeMenu(restaurantId);
    await makeOrder(restaurantId, membershipId, [[menu.chickenId, 2]], 1);
    const challengeId = await makeTryChallenge(restaurantId, { menuItemId: menu.chickenId });
    await db.owner`update challenge set created_at = now() where id = ${challengeId}`;
    expect(await progressOf(restaurantId, membershipId, challengeId)).toBe(0);
  });

  it("a section challenge counts every dish in that section", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const menu = await makeMenu(restaurantId);
    const challengeId = await makeTryChallenge(restaurantId, { menuSectionId: menu.sectionId });
    await makeOrder(restaurantId, membershipId, [[menu.chickenId, 1], [menu.wrapId, 1]]);
    expect(await progressOf(restaurantId, membershipId, challengeId)).toBe(2);
  });

  it("refuses a dish from another restaurant", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: otherId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const otherMenu = await makeMenu(otherId);
    await expect(
      makeTryChallenge(restaurantId, { menuItemId: otherMenu.chickenId }),
    ).rejects.toThrow();
  });

  it("refuses a challenge with both a dish and a section, or neither", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const menu = await makeMenu(restaurantId);
    await expect(
      makeTryChallenge(restaurantId, { menuItemId: menu.chickenId, menuSectionId: menu.sectionId }),
    ).rejects.toThrow();
    await expect(makeTryChallenge(restaurantId, {})).rejects.toThrow();
  });

  it("gives the reward once per member, and the second claim does nothing", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const menu = await makeMenu(restaurantId);
    const challengeId = await makeTryChallenge(restaurantId, { menuItemId: menu.chickenId }, 1);
    await makeOrder(restaurantId, membershipId, [[menu.chickenId, 1]]);
    const key = `fx-${token()}`;
    const result = await asApp(db.app, { restaurantId }, async (tx) => {
      const [first] = await tx`select out_result from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${key}, null)`;
      const [again] = await tx`select out_result from claim_challenge(${restaurantId}, ${membershipId}, ${challengeId}, ${key}, null)`;
      const [row] = await tx`select count(*)::int as n from challenge_claim
        where challenge_id = ${challengeId} and membership_id = ${membershipId}`;
      return { first: first?.["out_result"], again: again?.["out_result"], claims: Number(row?.["n"]) };
    });
    expect(result.first).toBe("claimed");
    expect(result.again).toBe("already_claimed");
    expect(result.claims).toBe(1);
  });

  it("accepts all four reward types", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const menu = await makeMenu(restaurantId);
    for (const rewardType of ["stamps", "free_item", "percent_off", "amount_off"]) {
      const id = await makeTryChallenge(restaurantId, { menuItemId: menu.chickenId }, 2, rewardType);
      expect(id).toBeTruthy();
    }
  });

  it("tells progress only to the restaurant that owns the challenge or the guest who owns the card", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const otherGuest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantA, guest.id);
    const menu = await makeMenu(restaurantA);
    const challengeId = await makeTryChallenge(restaurantA, { menuItemId: menu.chickenId });
    await makeOrder(restaurantA, membershipId, [[menu.chickenId, 1]]);
    const ask = (context: { restaurantId?: string; customerId?: string }) =>
      asApp(db.app, context, async (tx) => {
        const [row] = await tx`select challenge_progress(${challengeId}, ${membershipId}) as p`;
        return Number(row!["p"]);
      });
    expect(await ask({ restaurantId: restaurantA })).toBe(1);
    expect(await ask({ customerId: guest.id })).toBe(1);
    // Another restaurant, another guest and a signed-out caller are all refused.
    await expect(ask({ restaurantId: restaurantB })).rejects.toThrow(/not_allowed/);
    await expect(ask({ customerId: otherGuest.id })).rejects.toThrow(/not_allowed/);
    await expect(ask({})).rejects.toThrow(/not_allowed/);
    // The dish counter underneath is not callable by the app role at all.
    await expect(
      asApp(db.app, { restaurantId: restaurantA }, (tx) =>
        tx`select challenge_try_item_progress(${challengeId}, ${membershipId})`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("restaurant B cannot see restaurant A's dish challenge", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const menu = await makeMenu(restaurantA);
    const challengeId = await makeTryChallenge(restaurantA, { menuItemId: menu.chickenId });
    const seen = await asApp(db.app, { restaurantId: restaurantB }, (tx) =>
      tx`select count(*)::int as n from challenge where id = ${challengeId}`,
    );
    expect(Number(seen[0]!["n"])).toBe(0);
  });
});
