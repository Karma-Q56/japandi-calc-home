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

  async function makeStaff(restaurantId: string, active = true) {
    const [row] = await db.owner`
      insert into staff_member (restaurant_id, display_name, pin_hmac, active)
      values (${restaurantId}, 'Till Tester', 'fx', ${active})
      returning id`;
    return row!["id"] as string;
  }

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
    const staffId = await makeStaff(restaurantId);
    const seen = await asApp(db.app, { restaurantId }, async (tx) => {
      await tx`select * from redeem_special_code(${restaurantId}, 'NOPE123', ${membershipId}, ${staffId}, ${`fx-${token()}`})`.catch(() => null);
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
    const staffId = await makeStaff(restaurantId);
    const code = `C${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    const specialId = await makeSpecial(restaurantId, code);
    // A public special is redeemed by a guest who holds an issued code for their membership.
    await db.owner`
      insert into special_code (restaurant_id, special_id, membership_id, code)
      values (${restaurantId}, ${specialId}, ${membershipId}, ${code})`;
    const key = `fx-${token()}`;

    // Both calls commit (rollback: false). With the default rollback the first use would vanish
    // and the second call would count as a fresh use instead of a replay.
    const first = await asApp(
      db.app,
      { restaurantId },
      (tx) => tx`select out_result from redeem_special_code(${restaurantId}, ${code}, ${membershipId}, ${staffId}, ${key})`,
      { rollback: false },
    );
    expect(first[0]!["out_result"]).toBe("ok");

    const again = await asApp(
      db.app,
      { restaurantId },
      (tx) => tx`select out_result from redeem_special_code(${restaurantId}, ${code}, ${membershipId}, ${staffId}, ${key})`,
      { rollback: false },
    );
    expect(again[0]!["out_result"]).toBe("replay");

    const uses = await db.owner`select count(*)::int as n from special_use where special_id = ${specialId}`;
    expect(uses[0]!["n"]).toBe(1);
  });

  it("refuses a call made from another restaurant's context", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipA = await makeMembership(db.owner, restaurantA, guest.id);
    const staffId = await makeStaff(restaurantA);
    await expect(
      asApp(
        db.app,
        { restaurantId: restaurantB },
        (tx) => tx`select * from redeem_special_code(${restaurantA}, 'ANY', ${membershipA}, ${staffId}, ${`fx-${token()}`})`,
      ),
    ).rejects.toThrow(/not_allowed/);
  });

  it("refuses a code that belongs to another restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipA = await makeMembership(db.owner, restaurantA, guest.id);
    const staffId = await makeStaff(restaurantA);
    const code = `D${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    await makeSpecial(restaurantB, code);
    const result = await asApp(db.app, { restaurantId: restaurantA }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantA}, ${code}, ${membershipA}, ${staffId}, ${`fx-${token()}`})`,
    );
    expect(result[0]!["out_result"]).toBe("not_found");
  });

  it("refuses a membership that belongs to another restaurant", async () => {
    const { id: restaurantA } = await makeRestaurant(db.owner, fixtures);
    const { id: restaurantB } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const membershipB = await makeMembership(db.owner, restaurantB, guest.id);
    const staffId = await makeStaff(restaurantA);
    const code = `E${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    await makeSpecial(restaurantA, code);
    const result = await asApp(db.app, { restaurantId: restaurantA }, (tx) =>
      tx`select out_result from redeem_special_code(${restaurantA}, ${code}, ${membershipB}, ${staffId}, ${`fx-${token()}`})`,
    );
    expect(result[0]!["out_result"]).toBe("not_member");
  });

  it("takes a public code with no personal copy, and a personal code only from its owner", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const owner = await makeGuest(db.owner, fixtures);
    const other = await makeGuest(db.owner, fixtures);
    const ownerCard = await makeMembership(db.owner, restaurantId, owner.id);
    const otherCard = await makeMembership(db.owner, restaurantId, other.id);
    const staffId = await makeStaff(restaurantId);
    const shared = `P${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    const personal = `T${token().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;
    await makeSpecial(restaurantId, shared);
    const targeted = await makeSpecial(restaurantId, null, "targeted");
    await db.owner`
      insert into special_code (restaurant_id, special_id, membership_id, code)
      values (${restaurantId}, ${targeted}, ${ownerCard}, ${personal})`;
    const use = async (code: string, card: string) => {
      const rows = await asApp(
        db.app,
        { restaurantId },
        (tx) => tx`select out_result, out_reward from redeem_special_code(
          ${restaurantId}, ${code}, ${card}, ${staffId}, ${`fx-${token()}`})`,
        { rollback: false },
      );
      return rows[0]!;
    };

    expect(await use(shared.toLowerCase(), ownerCard)).toMatchObject({
      out_result: "ok",
      out_reward: "Free coffee",
    });
    expect((await use(shared, ownerCard))["out_result"]).toBe("already_used");
    expect((await use(personal, otherCard))["out_result"]).toBe("not_member");
    expect((await use(personal, ownerCard))["out_result"]).toBe("ok");
    expect((await use(personal, ownerCard))["out_result"]).toBe("already_used");
  });

  it("takes a campaign code once, only from a guest it was sent to", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const sent = await makeGuest(db.owner, fixtures);
    const missed = await makeGuest(db.owner, fixtures);
    const sentCard = await makeMembership(db.owner, restaurantId, sent.id);
    const missedCard = await makeMembership(db.owner, restaurantId, missed.id);
    const staffId = await makeStaff(restaurantId);
    await db.owner.begin(async (tx) => {
      await tx`select set_config('app.is_operator', 'true', true)`;
      const [campaign] = await tx`
        insert into campaign (restaurant_id, name, code, message_body, audience, status, created_by)
        values (${restaurantId}, 'Winter coffee', 'WINTER9', 'Free coffee with code WINTER9',
                '{"type":"everyone"}'::jsonb, 'sent', 'owner')
        returning id`;
      await tx`
        insert into message (campaign_id, restaurant_id, membership_id, channel, status)
        values (${campaign!["id"]}, ${restaurantId}, ${sentCard}, 'sms', 'delivered')`;
    });
    const use = async (card: string) => {
      const rows = await asApp(
        db.app,
        { restaurantId },
        (tx) => tx`select out_result from redeem_special_code(
          ${restaurantId}, 'winter9', ${card}, ${staffId}, ${`fx-${token()}`})`,
        { rollback: false },
      );
      return rows[0]!["out_result"];
    };

    expect(await use(missedCard)).toBe("not_member");
    expect(await use(sentCard)).toBe("ok");
    expect(await use(sentCard)).toBe("already_used");
  });

  it("refuses a staff member who has been switched off", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const guest = await makeGuest(db.owner, fixtures);
    const card = await makeMembership(db.owner, restaurantId, guest.id);
    const staffId = await makeStaff(restaurantId, false);
    await expect(
      asApp(db.app, { restaurantId }, (tx) =>
        tx`select * from redeem_special_code(${restaurantId}, 'ANY', ${card}, ${staffId}, ${`fx-${token()}`})`,
      ),
    ).rejects.toThrow(/not_allowed/);
  });

  it("does not let the app role write special_use straight to the table", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const written = await asApp(db.app, { restaurantId }, (tx) =>
      tx`delete from special_use where restaurant_id = ${restaurantId} returning id`.catch(() => []),
    );
    expect(written.length).toBe(0);
  });
});
