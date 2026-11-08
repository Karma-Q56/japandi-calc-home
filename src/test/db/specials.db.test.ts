// @vitest-environment node
// Real database test for migration 0020 (redeem_special_code).
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

describe.skipIf(!dbTestsEnabled)("specials (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function makeSpecial(restaurantId: string, code: string | null, kind = "public") {
    const [row] = await db.owner`
      insert into special (restaurant_id, title, reward_text, kind, code, active)
      values (${restaurantId}, ${`fx-${token()}`}, 'Free coffee', ${kind}, ${code}, true)
      returning id`;
    return row!["id"] as string;
  }

  it("does not leave operator power switched on after redeem_special_code returns", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const seen = await asApp(db.app, { restaurantId }, async (tx) => {
      await tx`select * from redeem_special_code(${restaurantId}, 'NOPE123', ${membershipId}, null, ${`fx-${token()}`})`.catch(() => null);
      const [flag] = await tx`select current_setting('app.is_operator', true) as v`;
      const [visible] = await tx`select count(*)::int as n from app_user`;
      return { flag: flag!["v"], visible: visible!["n"] };
    });
    expect(seen.flag).toBe("false");
    expect(seen.visible).toBe(0);
  });

  it("redeems a public code once and replays the same key without a second use", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const code = `C${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    const specialId = await makeSpecial(restaurantId, code);
    // A public special is redeemed by a guest who holds an issued code for their membership.
    await db.owner`
      insert into special_code (restaurant_id, special_id, membership_id, code)
      values (${restaurantId}, ${specialId}, ${membershipId}, ${code})`;
    const key = `fx-${token()}`;

    const first = await asApp(db.app, { restaurantId }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantId}, ${code}, ${membershipId}, null, ${key})`,
    );
    expect(first[0]!["out_result"]).toBe("ok");

    const again = await asApp(db.app, { restaurantId }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantId}, ${code}, ${membershipId}, null, ${key})`,
    );
    expect(again[0]!["out_result"]).toBe("replay");

    const uses = await db.owner`select count(*)::int as n from special_use where special_id = ${specialId}`;
    expect(uses[0]!["n"]).toBe(1);
  });

  it("refuses a code that belongs to another restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipA = await makeMembership(db.owner, restaurantA, guest.id);
    const code = `D${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    await makeSpecial(restaurantB, code);
    const result = await asApp(db.app, { restaurantId: restaurantA }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantA}, ${code}, ${membershipA}, null, ${`fx-${token()}`})`,
    );
    expect(result[0]!["out_result"]).toBe("not_found");
  });

  it("refuses a membership that belongs to another restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipB = await makeMembership(db.owner, restaurantB, guest.id);
    const code = `E${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    await makeSpecial(restaurantA, code);
    const result = await asApp(db.app, { restaurantId: restaurantA }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantA}, ${code}, ${membershipB}, null, ${`fx-${token()}`})`,
    );
    expect(result[0]!["out_result"]).toBe("not_member");
  });

  it("does not let the app role write special_use straight to the table", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const written = await asApp(db.app, { restaurantId }, (tx) =>
      tx`delete from special_use where restaurant_id = ${restaurantId} returning id`.catch(() => []),
    );
    expect(written.length).toBe(0);
  });
});
