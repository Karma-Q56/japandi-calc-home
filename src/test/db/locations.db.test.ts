import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  connect,
  cleanup,
  asApp,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

// Real-database checks for migration 0015. Skipped unless DATABASE_URL_MIGRATE and
// DATABASE_URL_TEST are set. Migrations 0014 and 0015 must be applied to that database first.
const d = dbTestsEnabled ? describe : describe.skip;

d("0015 locations (real database)", () => {
  let conn: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let restaurantA: string;
  let restaurantB: string;

  beforeAll(async () => {
    conn = connect();
    restaurantA = (await makeRestaurant(conn.owner, fixtures, { status: "active" })).id;
    restaurantB = (await makeRestaurant(conn.owner, fixtures, { status: "active" })).id;
  });

  afterAll(async () => {
    await cleanup(conn.owner, fixtures);
    await conn.close();
  });

  it("gives a new restaurant exactly one main location", async () => {
    const rows = await asApp(conn.app, { restaurantId: restaurantA, operator: false }, (tx) =>
      tx`select count(*)::int as n from location where restaurant_id = ${restaurantA} and is_main = true`,
    );
    expect(rows[0]?.["n"]).toBe(1);
  });

  it("refuses a second main location for the same restaurant", async () => {
    await expect(
      asApp(conn.app, { restaurantId: restaurantA, operator: false }, (tx) =>
        tx`insert into location (restaurant_id, name, is_main) values (${restaurantA}, 'Second', true)`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a location insert for another restaurant", async () => {
    await expect(
      asApp(conn.app, { restaurantId: restaurantB, operator: false }, (tx) =>
        tx`insert into location (restaurant_id, name, is_main) values (${restaurantA}, 'Intruder', false)`,
      ),
    ).rejects.toThrow();
  });

  it("does not show another restaurant's locations", async () => {
    const rows = await asApp(conn.app, { restaurantId: restaurantB, operator: false }, (tx) =>
      tx`select id from location where restaurant_id = ${restaurantA}`,
    );
    expect(rows.length).toBe(0);
  });

  it("app role cannot delete a location", async () => {
    await expect(
      asApp(conn.app, { restaurantId: restaurantA, operator: false }, (tx) => tx`delete from location`),
    ).rejects.toThrow();
  });

});
