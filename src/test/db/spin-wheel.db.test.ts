// @vitest-environment node
// Real database test for migration 0019 (live spin wheel, D12d).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
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
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("live spin wheel (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  // A restaurant with its wheel on, one guest with the given spins, and their membership.
  async function setup(spins: number, prizes: { weight: number; type?: "stamps" | "free_item" }[] = [{ weight: 1 }]) {
    const restaurant = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set spin_enabled = true, spin_mode = 'earned' where id = ${restaurant.id}`;
    for (const [index, p] of prizes.entries()) {
      if (p.type === "stamps") {
        await db.owner`
          insert into spin_prize (restaurant_id, position, label, weight, reward_type, bonus_stamps)
          values (${restaurant.id}, ${index + 1}, ${`Prize ${index + 1}`}, ${p.weight}, 'stamps', 1)
        `;
      } else {
        await db.owner`
          insert into spin_prize (restaurant_id, position, label, weight, reward_type, reward_item)
          values (${restaurant.id}, ${index + 1}, ${`Prize ${index + 1}`}, ${p.weight}, 'free_item', 'Coffee')
        `;
      }
    }
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurant.id, guest.id);
    if (spins > 0) {
      await db.owner`
        insert into spin_credit (membership_id, restaurant_id, earned, used)
        values (${membershipId}, ${restaurant.id}, ${spins}, 0)
      `;
    }
    return { restaurantId: restaurant.id, membershipId, guestId: guest.id };
  }

  // Commit each spin, as a real guest request does. Rolled-back spins would not be seen by the next call.
  const spinAs = (restaurantId: string, membershipId: string, key: string) =>
    asApp(
      db.app,
      { restaurantId },
      async (tx) =>
        tx<{ out_result: string; out_label: string | null }[]>`
          select * from spin_wheel(${membershipId}, ${key})
        `,
      { rollback: false },
    );

  it("refuses a spin when the guest has no spins left", async () => {
    const { restaurantId, membershipId } = await setup(0);
    const [row] = await spinAs(restaurantId, membershipId, token());
    expect(row?.out_result).toBe("no_spin");
  });

  it("pays a repeated spin id once", async () => {
    const { restaurantId, membershipId } = await setup(2);
    const key = token();
    const [first] = await spinAs(restaurantId, membershipId, key);
    const [again] = await spinAs(restaurantId, membershipId, key);
    expect(first?.out_result).toBe("won");
    expect(again?.out_result).toBe("duplicate_retry");
    const credit = await db.owner<{ used: number }[]>`select used from spin_credit where membership_id = ${membershipId}`;
    expect(credit[0]?.used).toBe(1);
  });

  it("never lets a guest spin more than they earned", async () => {
    const { restaurantId, membershipId } = await setup(1);
    const [first] = await spinAs(restaurantId, membershipId, token());
    const [second] = await spinAs(restaurantId, membershipId, token());
    expect(first?.out_result).toBe("won");
    expect(second?.out_result).toBe("no_spin");
  });

  it("follows the prize weights over many draws, with loose tolerance", async () => {
    const { restaurantId, membershipId } = await setup(400, [{ weight: 1 }, { weight: 3 }]);
    const counts: Record<string, number> = { "Prize 1": 0, "Prize 2": 0 };
    for (let i = 0; i < 400; i++) {
      const [row] = await spinAs(restaurantId, membershipId, token());
      if (row?.out_result === "won" && row.out_label) counts[row.out_label] = (counts[row.out_label] ?? 0) + 1;
    }
    // Expect about 25% and 75%. A loose band keeps the test from being flaky.
    expect(counts["Prize 1"]!).toBeGreaterThan(40);
    expect(counts["Prize 1"]!).toBeLessThan(160);
  });

  it("pays a bonus stamp as a stamp event with the spin key", async () => {
    const { restaurantId, membershipId } = await setup(1, [{ weight: 1, type: "stamps" }]);
    const key = token();
    await spinAs(restaurantId, membershipId, key);
    const rows = await db.owner<{ reason: string }[]>`
      select reason from stamp_event where membership_id = ${membershipId} and idempotency_key = ${`spin:${key}`}
    `;
    expect(rows[0]?.reason).toBe("bonus");
  });

  it("refuses a ninth prize", async () => {
    const restaurant = await makeRestaurant(db.owner, fixtures, { status: "active" });
    let refused = false;
    for (let position = 1; position <= 9; position++) {
      try {
        await db.owner`
          insert into spin_prize (restaurant_id, position, label, weight, reward_type, reward_item)
          values (${restaurant.id}, ${position}, ${`Prize ${position}`}, 1, 'free_item', 'Coffee')
        `;
      } catch {
        refused = true;
      }
    }
    expect(refused).toBe(true);
  });

  it("refuses a read or write of another restaurant's prizes", async () => {
    const a = await setup(0);
    const b = await setup(0);
    const seen = await asApp(db.app, { restaurantId: b.restaurantId }, (tx) =>
      tx<{ id: string }[]>`select id from spin_prize where restaurant_id = ${a.restaurantId}`,
    );
    expect(seen.length).toBe(0);
    await expect(
      asApp(db.app, { restaurantId: b.restaurantId }, (tx) =>
        tx`
          insert into spin_prize (restaurant_id, position, label, weight, reward_type, reward_item)
          values (${a.restaurantId}, 2, 'Sneaky', 1, 'free_item', 'Coffee')
        `,
      ),
    ).rejects.toThrow();
  });

  it("stops a guest of one restaurant spinning another restaurant's wheel", async () => {
    const a = await setup(1);
    const b = await setup(1);
    await expect(spinAs(b.restaurantId, a.membershipId, token())).rejects.toThrow();
  });
});
