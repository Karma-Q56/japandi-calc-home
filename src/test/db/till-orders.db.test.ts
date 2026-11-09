// @vitest-environment node
// Real database test for migration 0024 (record_visit_items, visit_item).
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
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("till orders (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function makeItem(restaurantId: string, available = true) {
    const [row] = await db.owner`
      insert into menu_item (restaurant_id, name, available)
      values (${restaurantId}, ${`fx-${token()}`}, ${available})
      returning id`;
    return row!["id"] as string;
  }

  async function makeStamp(restaurantId: string, membershipId: string, ageMinutes = 0) {
    const [row] = await db.owner`
      insert into stamp_event (restaurant_id, membership_id, status, idempotency_key, created_at, reason)
      values (${restaurantId}, ${membershipId}, 'valid', ${`fx-${token()}`},
              now() - make_interval(mins => ${ageMinutes}), 'visit')
      returning id`;
    return row!["id"] as string;
  }

  const payload = (ids: string[]) =>
    JSON.stringify(ids.map((menu_item_id) => ({ menu_item_id, quantity: 1 })));

  async function record(restaurantId: string, stampId: string, items: string) {
    const rows = await asApp(
      db.app,
      { restaurantId },
      (tx) => tx`select record_visit_items(${stampId}::uuid, ${items}::jsonb) as result`,
      { rollback: false },
    );
    return rows[0]!["result"] as string;
  }

  it("accepts items for a recent stamp of the same restaurant", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const stampId = await makeStamp(restaurantId, membershipId);
    const item = await makeItem(restaurantId);
    expect(await record(restaurantId, stampId, payload([item]))).toBe("saved");
  });

  it("refuses a stamp that belongs to another restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantA, guest.id);
    const stampId = await makeStamp(restaurantA, membershipId);
    const itemB = await makeItem(restaurantB);
    expect(await record(restaurantB, stampId, payload([itemB]))).toBe("stamp_not_found");
  });

  it("refuses a stamp older than 15 minutes", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const stampId = await makeStamp(restaurantId, membershipId, 30);
    const item = await makeItem(restaurantId);
    expect(await record(restaurantId, stampId, payload([item]))).toBe("stamp_too_old");
  });

  it("refuses an unavailable item and an item from another restaurant", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const { id: otherId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const stampId = await makeStamp(restaurantId, membershipId);
    const hidden = await makeItem(restaurantId, false);
    const foreign = await makeItem(otherId);
    expect(await record(restaurantId, stampId, payload([hidden]))).toBe("item_not_allowed");
    expect(await record(restaurantId, stampId, payload([foreign]))).toBe("item_not_allowed");
  });

  it("refuses more than 12 distinct items", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const stampId = await makeStamp(restaurantId, membershipId);
    const items: string[] = [];
    for (let i = 0; i < 13; i++) items.push(await makeItem(restaurantId));
    expect(await record(restaurantId, stampId, payload(items))).toBe("too_many_items");
  });

  it("a repeat call replaces the earlier list for the same stamp", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const stampId = await makeStamp(restaurantId, membershipId);
    const first = await makeItem(restaurantId);
    const second = await makeItem(restaurantId);
    expect(await record(restaurantId, stampId, payload([first]))).toBe("saved");
    expect(await record(restaurantId, stampId, payload([second]))).toBe("saved");
    const rows = await db.owner`select menu_item_id from visit_item where stamp_event_id = ${stampId}`;
    expect(rows.map((row) => row!["menu_item_id"])).toEqual([second]);
  });

  it("restaurant B cannot read restaurant A's orders, and staff of A cannot write for B", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantA, guest.id);
    const stampId = await makeStamp(restaurantA, membershipId);
    const itemA = await makeItem(restaurantA);
    expect(await record(restaurantA, stampId, payload([itemA]))).toBe("saved");

    const seenByB = await asApp(db.app, { restaurantId: restaurantB }, (tx) =>
      tx`select count(*)::int as n from visit_item`,
    );
    expect(seenByB[0]!["n"]).toBe(0);

    const writtenForB = await record(restaurantB, stampId, payload([itemA]));
    expect(writtenForB).toBe("stamp_not_found");
  });
});
