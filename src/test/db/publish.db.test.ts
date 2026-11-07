// @vitest-environment node
// Real database test for migration 0014 (publish, unpublish, listing, active-only public reads).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  newFixtures,
  token,
  type DbConnections,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("publish restaurant (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const createFor = async (userId: string) => {
    const slug = `fx-${token().slice(0, 20)}`;
    const [created] = await asApp(
      db.app,
      {},
      (tx) => tx`select create_restaurant_for_owner(${userId}, 'Publish Cafe', ${slug}, 'Rosebank', 'Johannesburg') as id`,
      { rollback: false },
    );
    const restaurantId = created!["id"] as string;
    fixtures.restaurants.push(restaurantId);
    return { restaurantId, slug };
  };

  it("keeps a new draft restaurant out of the public read", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const { restaurantId, slug } = await createFor(userId);
    const visible = await asApp(db.app, {}, (tx) => tx`select id from restaurant where slug = ${slug}`);
    expect(visible.length).toBe(0);
    const [row] = await db.owner`select status from restaurant where id = ${restaurantId}`;
    expect(row).toMatchObject({ status: "draft" });
  });

  it("refuses to publish until the menu, team and suburb are ready", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const { restaurantId } = await createFor(userId);
    await expect(
      asApp(db.app, {}, (tx) => tx`select publish_restaurant(${userId})`, { rollback: true }),
    ).rejects.toMatchObject({ message: "not_ready" });
    const [row] = await db.owner`select status from restaurant where id = ${restaurantId}`;
    expect(row).toMatchObject({ status: "draft" });
  });

  it("refuses publish, unpublish and listing for a guest or operator login", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    await expect(
      asApp(db.app, {}, (tx) => tx`select publish_restaurant_for_user(${operator})`, { rollback: true }),
    ).rejects.toMatchObject({ message: "not_allowed" });

    const guest = await makeAppUser(db.owner, fixtures);
    await expect(
      asApp(db.app, {}, (tx) => tx`select unpublish_restaurant(${guest})`, { rollback: true }),
    ).rejects.toMatchObject({ message: "not_allowed" });
    await expect(
      asApp(db.app, {}, (tx) => tx`select set_restaurant_listed(${guest}, true)`, { rollback: true }),
    ).rejects.toMatchObject({ message: "not_allowed" });
  });

  it("does not let the app role change status by writing to restaurant directly", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const { restaurantId } = await createFor(userId);
    const changed = await asApp(
      db.app,
      {},
      (tx) => tx`update restaurant set status = 'active' where id = ${restaurantId} returning id`,
    );
    expect(changed.length).toBe(0);
  });
});
