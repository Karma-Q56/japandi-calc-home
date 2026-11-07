// @vitest-environment node
// Real database test for migration 0013 (create_restaurant_for_owner).
// It is also the worked example for new database tests: copy its shape.
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

describe.skipIf(!dbTestsEnabled)("create_restaurant_for_owner (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const create = (userId: string, slug: string, name = "Fixture Cafe") =>
    asApp(
      db.app,
      {},
      (tx) => tx`select create_restaurant_for_owner(${userId}, ${name}, ${slug}, 'Rosebank', 'Johannesburg') as id`,
      { rollback: false },
    );

  it("makes a guest the owner of a private draft restaurant on the starter plan", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const slug = `fx-${token().slice(0, 20)}`;
    const [created] = await create(userId, slug);
    const restaurantId = created!["id"] as string;
    fixtures.restaurants.push(restaurantId);

    const [restaurant] = await db.owner`
      select status, plan, public_listed, suburb, city from restaurant where id = ${restaurantId}
    `;
    expect(restaurant).toMatchObject({ status: "draft", plan: "starter", public_listed: false, suburb: "Rosebank" });
    const [login] = await db.owner`select role, restaurant_id from app_user where user_id = ${userId}`;
    expect(login).toMatchObject({ role: "owner", restaurant_id: restaurantId });
    const [audit] = await db.owner`
      select count(*)::int as n from audit_event where restaurant_id = ${restaurantId} and action = 'restaurant_created'
    `;
    expect(audit!["n"]).toBe(1);
  });

  it("refuses a second restaurant for the same login", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const [first] = await create(userId, `fx-${token().slice(0, 20)}`);
    fixtures.restaurants.push(first!["id"] as string);
    await expect(create(userId, `fx-${token().slice(0, 20)}`)).rejects.toMatchObject({
      message: "already_has_restaurant",
    });
  });

  it("refuses an owner or operator login, a taken slug, a reserved slug and bad input", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    await expect(create(operator, `fx-${token().slice(0, 20)}`)).rejects.toMatchObject({ message: "not_a_guest" });

    const guest = await makeAppUser(db.owner, fixtures);
    await expect(create(guest, "app")).rejects.toMatchObject({ message: "slug_reserved" });
    await expect(create(guest, "Bad Slug")).rejects.toMatchObject({ message: "bad_slug" });
    await expect(create(guest, `fx-${token().slice(0, 20)}`, "x")).rejects.toMatchObject({ message: "bad_name" });
    await expect(create("no-such-user", `fx-${token().slice(0, 20)}`)).rejects.toMatchObject({
      message: "user_not_found",
    });

    const owner = await makeAppUser(db.owner, fixtures);
    const takenSlug = `fx-${token().slice(0, 20)}`;
    const [made] = await create(owner, takenSlug);
    fixtures.restaurants.push(made!["id"] as string);
    const other = await makeAppUser(db.owner, fixtures);
    await expect(create(other, takenSlug)).rejects.toMatchObject({ message: "slug_taken" });
  });

  it("does not leave operator power switched on for the rest of the caller's transaction", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const slug = `fx-${token().slice(0, 20)}`;
    const seen = await asApp(db.app, {}, async (tx) => {
      await tx`select create_restaurant_for_owner(${userId}, 'Leak Check', ${slug}, null, null)`;
      const [flag] = await tx`select current_setting('app.is_operator', true) as v`;
      // With operator power still on, this would return every login row. It must return none.
      const [visible] = await tx`select count(*)::int as n from app_user`;
      return { flag: flag!["v"], visible: visible!["n"] };
    });
    expect(seen.flag).toBe("false");
    expect(seen.visible).toBe(0);
  });

  it("does not let the app role promote itself by writing to app_user directly", async () => {
    const userId = await makeAppUser(db.owner, fixtures);
    const changed = await asApp(db.app, {}, (tx) => tx`update app_user set role = 'operator' where user_id = ${userId} returning user_id`);
    expect(changed.length).toBe(0);
  });
});
