// @vitest-environment node
// Real database test for migration 0028 (web push). Runs on GitHub for every push.
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

describe.skipIf(!dbTestsEnabled)("web push (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function subscribe(customerId: string, label: string) {
    await db.owner`
      insert into push_subscription (customer_id, endpoint, p256dh, auth)
      values (${customerId}, ${`https://push.example.com/${label}-${token()}`}, ${"B".repeat(87)}, ${"A".repeat(22)})`;
  }

  it("lets a guest read only their own push subscription", async () => {
    const restaurant = await makeRestaurant(db.owner, fixtures);
    const alice = await makeGuest(db.owner, fixtures);
    const bob = await makeGuest(db.owner, fixtures);
    await subscribe(alice.id, "alice");
    await subscribe(bob.id, "bob");
    const seen = await asApp(db.app, { restaurantId: restaurant.id, customerId: alice.id }, async (tx) => {
      const rows = await tx`select customer_id from push_subscription`;
      return rows.map((row) => row["customer_id"]);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((id) => id === alice.id)).toBe(true);
  });

  it("does not let an operator context read raw push endpoints", async () => {
    const restaurant = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    await subscribe(guest.id, "hidden");
    const count = await asApp(db.app, { restaurantId: restaurant.id, operator: true }, async (tx) => {
      const [row] = await tx`select count(*)::int as n from push_subscription`;
      return row!["n"] as number;
    });
    expect(count).toBe(0);
  });

  it("push_reach counts only opted in members with a live subscription", async () => {
    const restaurant = await makeRestaurant(db.owner, fixtures);
    const optedIn = await makeGuest(db.owner, fixtures);
    const optedOut = await makeGuest(db.owner, fixtures);
    const memberIn = await makeMembership(db.owner, restaurant.id, optedIn.id);
    const memberOut = await makeMembership(db.owner, restaurant.id, optedOut.id);
    await db.owner`update membership set marketing_push = 'opted_in' where id = ${memberIn}`;
    await db.owner`update membership set marketing_push = 'opted_out' where id = ${memberOut}`;
    await subscribe(optedIn.id, "in");
    await subscribe(optedOut.id, "out");
    const reach = await asApp(db.app, { restaurantId: restaurant.id }, async (tx) => {
      const [row] = await tx`select push_reach(${restaurant.id}) as reach`;
      return Number(row!["reach"]);
    });
    expect(reach).toBe(1);
  });

  it("push_reach returns zero for a restaurant with no members", async () => {
    const restaurant = await makeRestaurant(db.owner, fixtures);
    const reach = await asApp(db.app, { restaurantId: restaurant.id }, async (tx) => {
      const [row] = await tx`select push_reach(${restaurant.id}) as reach`;
      return Number(row!["reach"]);
    });
    expect(reach).toBe(0);
  });

  it("push_reach refuses another restaurant's audience and a call with no context", async () => {
    const mine = await makeRestaurant(db.owner, fixtures);
    const theirs = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { restaurantId: mine.id }, (tx) => tx`select push_reach(${theirs.id})`),
    ).rejects.toThrow(/not_allowed/);
    await expect(asApp(db.app, {}, (tx) => tx`select push_reach(${theirs.id})`)).rejects.toThrow(/not_allowed/);
  });
});
