// @vitest-environment node
// Real database test for migration 0022 (owner settings, activity, feedback, ideas, D13a).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("owner admin (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  /** A restaurant with a suburb, owned by one login. */
  async function ownedRestaurant(role: "owner" | "manager" | "guest" = "owner") {
    const { id } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set suburb = 'Sea Point', city = 'Cape Town', name = 'Harbour Cafe' where id = ${id}`;
    const user = await makeAppUser(db.owner, fixtures, { role, restaurantId: id });
    return { restaurantId: id, user };
  }

  const saveArgs = (user: string, overrides: Partial<Record<string, unknown>> = {}) => ({
    user,
    name: "Harbour Cafe",
    phone: "021 555 0100",
    address: "1 Main Road",
    suburb: "Sea Point",
    city: "Cape Town",
    email: "orders@example.test",
    offers: true,
    till: false,
    marketing: 3,
    member: 2,
    ...overrides,
  });

  async function saveSettings(a: ReturnType<typeof saveArgs>) {
    return asApp(
      db.app,
      { operator: false },
      (tx) =>
        tx`select save_owner_settings(${a.user}, ${a.name}, ${a.phone}, ${a.address}, ${a.suburb}, ${a.city},
          ${a.email}, ${a.offers}, ${a.till}, ${a.marketing}, ${a.member})`,
      { rollback: false },
    );
  }

  it("saves settings for an owner and writes an audit row when the name changes", async () => {
    const { restaurantId, user } = await ownedRestaurant("owner");
    await saveSettings(saveArgs(user, { name: "Harbour Cafe Two", till: true }));
    const [row] = await db.owner`select name, orders_at_till from restaurant where id = ${restaurantId}`;
    expect(row!["name"]).toBe("Harbour Cafe Two");
    expect(row!["orders_at_till"]).toBe(true);
    const audit = await db.owner`
      select action from audit_event where restaurant_id = ${restaurantId} order by created_at`;
    const actions = audit.map((r) => r["action"]);
    expect(actions).toContain("restaurant_details_changed");
    expect(actions).toContain("settings_changed");
  });

  it("lets a manager save settings", async () => {
    const { restaurantId, user } = await ownedRestaurant("manager");
    await saveSettings(saveArgs(user, { marketing: 5 }));
    const [row] = await db.owner`select marketing_weekly_cap from restaurant where id = ${restaurantId}`;
    expect(row!["marketing_weekly_cap"]).toBe(5);
  });

  it("refuses a save from a guest login and changes nothing", async () => {
    const { restaurantId, user } = await ownedRestaurant("guest");
    await expect(saveSettings(saveArgs(user, { name: "Hacked" }))).rejects.toThrow(/not_allowed/);
    const [row] = await db.owner`select name from restaurant where id = ${restaurantId}`;
    expect(row!["name"]).toBe("Harbour Cafe");
  });

  it("saves only the caller's own restaurant when two owners save at once", async () => {
    const a = await ownedRestaurant("owner");
    const b = await ownedRestaurant("owner");
    await saveSettings(saveArgs(a.user, { name: "A renamed" }));
    const [rowB] = await db.owner`select name from restaurant where id = ${b.restaurantId}`;
    expect(rowB!["name"]).toBe("Harbour Cafe");
  });

  it("refuses invalid values with invalid_value", async () => {
    const { user } = await ownedRestaurant("owner");
    await expect(saveSettings(saveArgs(user, { marketing: 15 }))).rejects.toThrow(/invalid_value/);
    await expect(saveSettings(saveArgs(user, { member: -1 }))).rejects.toThrow(/invalid_value/);
    await expect(saveSettings(saveArgs(user, { name: "" }))).rejects.toThrow(/invalid_value/);
    await expect(saveSettings(saveArgs(user, { phone: "call me" }))).rejects.toThrow(/invalid_value|check/);
  });

  it("refuses a login that does not exist", async () => {
    await expect(saveSettings(saveArgs(`t-missing-${token()}`))).rejects.toThrow(/not_allowed/);
  });

  it("shows an owner only their own restaurant's activity", async () => {
    const a = await ownedRestaurant("owner");
    const b = await ownedRestaurant("owner");
    await saveSettings(saveArgs(a.user, { name: "A renamed" }));
    await saveSettings(saveArgs(b.user, { name: "B renamed" }));
    const rows = await asApp(
      db.app,
      { operator: false },
      (tx) => tx`select restaurant_id::text as rid from list_owner_activity(${a.user}, null)`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row["rid"]).toBe(a.restaurantId);
  });

  it("refuses to let an owner read a guest's activity login", async () => {
    const { user } = await ownedRestaurant("guest");
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`select * from list_owner_activity(${user}, null)`),
    ).rejects.toThrow(/not_allowed/);
  });

  it("keeps audit rows append only for the app role", async () => {
    const { restaurantId } = await ownedRestaurant("owner");
    await db.owner`insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
      values ('system', 'test', ${restaurantId}, 'settings_changed', 'restaurant', ${restaurantId}, '{}'::jsonb)`;
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`update audit_event set action = 'x' where restaurant_id = ${restaurantId}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`delete from audit_event where restaurant_id = ${restaurantId}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("sends feedback as the owner's restaurant and lists only their own", async () => {
    const a = await ownedRestaurant("owner");
    const b = await ownedRestaurant("owner");
    const idA = `fb-${token()}`;
    await asApp(
      db.app,
      { operator: false },
      (tx) => tx`select send_owner_feedback(${a.user}, ${idA}, 'broken', 'The till screen froze twice today')`,
      { rollback: false },
    );
    const mine = await asApp(db.app, { operator: false }, (tx) => tx`select id from list_owner_feedback(${a.user})`);
    expect(mine.map((r) => r["id"])).toContain(idA);
    const theirs = await asApp(db.app, { operator: false }, (tx) => tx`select id from list_owner_feedback(${b.user})`);
    expect(theirs.map((r) => r["id"])).not.toContain(idA);
  });

  it("refuses bad feedback categories and short messages", async () => {
    const { user } = await ownedRestaurant("owner");
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`select send_owner_feedback(${user}, ${`fb-${token()}`}, 'rude', 'Long enough message')`),
    ).rejects.toThrow(/invalid_value/);
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`select send_owner_feedback(${user}, ${`fb-${token()}`}, 'other', 'short')`),
    ).rejects.toThrow(/invalid_value/);
  });

  it("stops feedback after 10 sends in a day", async () => {
    const { user } = await ownedRestaurant("owner");
    for (let i = 0; i < 10; i++) {
      await asApp(
        db.app,
        { operator: false },
        (tx) => tx`select send_owner_feedback(${user}, ${`fb-${token()}`}, 'other', ${`A useful note number ${i}`})`,
        { rollback: false },
      );
    }
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`select send_owner_feedback(${user}, ${`fb-${token()}`}, 'other', 'One too many')`),
    ).rejects.toThrow(/rate_limited/);
  });

  it("counts an idea ask up for the same place and suburb", async () => {
    const a = await ownedRestaurant("owner");
    const b = await ownedRestaurant("owner");
    const place = `Place ${token().slice(0, 8)}`;
    const first = await asApp(
      db.app,
      { operator: false },
      (tx) => tx`select submit_owner_idea(${a.user}, ${place}, 'Add a bakery')`,
      { rollback: false },
    );
    const second = await asApp(
      db.app,
      { operator: false },
      (tx) => tx`select submit_owner_idea(${b.user}, ${place}, null)`,
      { rollback: false },
    );
    expect(Number(first[0]!["submit_owner_idea"])).toBe(1);
    expect(Number(second[0]!["submit_owner_idea"])).toBe(2);
    const board = await asApp(db.app, { operator: false }, (tx) => tx`select place, asks from list_owner_ideas(${a.user})`);
    const row = board.find((r) => r["place"] === place);
    expect(Number(row!["asks"])).toBeGreaterThanOrEqual(2);
  });

  it("switches Help from Patron on for a set number of days and off again", async () => {
    const { restaurantId, user } = await ownedRestaurant("owner");
    await asApp(db.app, { operator: false }, (tx) => tx`select set_owner_help(${user}, true, 7)`, { rollback: false });
    const [on] = await db.owner`select patron_help_enabled, patron_help_expires_at from restaurant where id = ${restaurantId}`;
    expect(on!["patron_help_enabled"]).toBe(true);
    expect(on!["patron_help_expires_at"]).toBeTruthy();
    await asApp(db.app, { operator: false }, (tx) => tx`select set_owner_help(${user}, false, null)`, { rollback: false });
    const [off] = await db.owner`select patron_help_enabled from restaurant where id = ${restaurantId}`;
    expect(off!["patron_help_enabled"]).toBe(false);
  });

  it("refuses a Help day count that is not 1, 7, 14 or 30", async () => {
    const { user } = await ownedRestaurant("owner");
    await expect(
      asApp(db.app, { operator: false }, (tx) => tx`select set_owner_help(${user}, true, 3)`),
    ).rejects.toThrow(/invalid_value/);
  });

  it("records a done-for-you campaign request as a lead an operator can read", async () => {
    const { restaurantId, user } = await ownedRestaurant("owner");
    await asApp(
      db.app,
      { operator: false },
      (tx) => tx`select request_owner_campaign(${user}, 'Please send a campaign for the lunch menu')`,
      { rollback: false },
    );
    const [lead] = await db.owner`
      select kind, plan_interest, status, consent_version from lead
      where restaurant_name = 'Harbour Cafe' and plan_interest = 'done_for_you_campaign'
      order by created_at desc limit 1`;
    expect(lead!["kind"]).toBe("waitlist");
    expect(lead!["status"]).toBe("new");
    expect(lead!["consent_version"]).toBe("owner-settings-v1");
    const audit = await db.owner`select action from audit_event where restaurant_id = ${restaurantId}`;
    expect(audit.map((r) => r["action"])).toContain("settings_changed");
  });
});
