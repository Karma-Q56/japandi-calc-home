// @vitest-environment node
// Real database test for migration 0029 (operator console, D18).
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

describe.skipIf(!dbTestsEnabled)("operator console (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function status(restaurantId: string): Promise<string> {
    const [row] = await db.owner`select status::text as s from restaurant where id = ${restaurantId}`;
    return row!["s"] as string;
  }

  it("changes status for an operator and writes an audit row", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await asApp(db.app, { operator: true }, (tx) =>
      tx`select operator_set_restaurant_status(${operator}, ${restaurantId}::uuid, 'paused', 'Owner asked to pause')`,
    );
    expect(await status(restaurantId)).toBe("paused");
    const [audit] = await db.owner`
      select actor_type, action from audit_event
      where restaurant_id = ${restaurantId} and action = 'restaurant_status_changed'`;
    expect(audit).toBeTruthy();
    expect(audit!["actor_type"]).toBe("operator");
  });

  it("refuses a status change from a login that is not an operator", async () => {
    const owner = await makeAppUser(db.owner, fixtures, { role: "owner" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_set_restaurant_status(${owner}, ${restaurantId}::uuid, 'closed', 'try it')`,
      ),
    ).rejects.toThrow(/not_operator/);
    expect(await status(restaurantId)).not.toBe("closed");
  });

  it("refuses a plan change from a plain guest login", async () => {
    const guest = await makeAppUser(db.owner, fixtures, { role: "guest" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_set_restaurant_plan(${guest}, ${restaurantId}::uuid, 'partner', 'try it')`,
      ),
    ).rejects.toThrow(/not_operator/);
  });

  it("changes plan for an operator and says same_plan when nothing changes", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await asApp(db.app, { operator: true }, (tx) =>
      tx`select operator_set_restaurant_plan(${operator}, ${restaurantId}::uuid, 'managed', 'Upgrade agreed')`,
    );
    const [row] = await db.owner`select plan::text as p from restaurant where id = ${restaurantId}`;
    expect(row!["p"]).toBe("managed");
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_set_restaurant_plan(${operator}, ${restaurantId}::uuid, 'managed', 'Again')`,
      ),
    ).rejects.toThrow(/same_plan/);
  });

  it("adds credit once for a reference and returns duplicate on a repeat", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const reference = `ops-fx-${token()}`;
    const run = () =>
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_add_credit(${operator}, ${restaurantId}::uuid, 'topup', 50000, ${reference}, 'EFT received') as id`,
      );
    const first = await run();
    const second = await run();
    expect(first[0]!["id"]).not.toBe("duplicate");
    expect(second[0]!["id"]).toBe("duplicate");
    const [rows] = await db.owner`select count(*)::int as n from credit_ledger where reference = ${reference}`;
    expect(rows!["n"]).toBe(1);
  });

  it("refuses a credit type other than topup or adjustment", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_add_credit(${operator}, ${restaurantId}::uuid, 'charge', 5000, ${`ops-${token()}`}, 'nope')`,
      ),
    ).rejects.toThrow(/bad_entry_type/);
  });

  it("refuses a zero or over-limit credit amount", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_add_credit(${operator}, ${restaurantId}::uuid, 'topup', 0, ${`ops-${token()}`}, 'zero')`,
      ),
    ).rejects.toThrow(/bad_amount/);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_add_credit(${operator}, ${restaurantId}::uuid, 'topup', 10000001, ${`ops-${token()}`}, 'too big')`,
      ),
    ).rejects.toThrow(/bad_amount/);
  });

  it("creates a draft restaurant for an owner email, not yet public", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const slug = `fx-${token().slice(0, 20)}`;
    // asApp rolls back at the end, so the checks run inside the same transaction as the insert.
    const seen = await asApp(db.app, { operator: true }, async (tx) => {
      const [created] = await tx`select operator_create_restaurant(${operator}, ${`owner-${token()}@example.test`}, 'Fixture Cafe', ${slug}, 'Rosebank', 'Johannesburg') as id`;
      const [row] = await tx`select status::text as s, plan::text as p, public_listed from restaurant where id = ${created!["id"] as string}::uuid`;
      return row!;
    });
    expect(seen["s"]).toBe("draft");
    expect(seen["p"]).toBe("starter");
    expect(seen["public_listed"]).toBe(false);
  });

  it("refuses a second restaurant with the same web address", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { slug } = await makeRestaurant(db.owner, fixtures);
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_create_restaurant(${operator}, 'owner2@example.test', 'Second Cafe', ${slug}, 'Rosebank', 'Johannesburg')`,
      ),
    ).rejects.toThrow(/slug_taken/);
  });

  it("approves a campaign waiting for approval and refuses a second decision", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const [camp] = await db.owner`
      insert into campaign (restaurant_id, name, message_body, audience, code, status, requires_approval)
      values (${restaurantId}, ${`fx-camp-${token()}`}, 'Hello', '{"type":"all_opted_in"}', 'FX123', 'pending_approval', true)
      returning id`;
    const campaignId = camp!["id"] as string;
    await asApp(db.app, { operator: true }, (tx) =>
      tx`select operator_decide_campaign(${operator}, ${campaignId}::uuid, 'approve', 'Looks fine')`,
    );
    const [row] = await db.owner`select status::text as s from campaign where id = ${campaignId}`;
    expect(row!["s"]).toBe("scheduled");
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_decide_campaign(${operator}, ${campaignId}::uuid, 'reject', 'Too late')`,
      ),
    ).rejects.toThrow(/not_pending/);
  });

  it("does not leave operator power switched on after a call returns", async () => {
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures);
    const seen = await asApp(db.app, { operator: false }, async (tx) => {
      await tx`select operator_set_restaurant_status(${operator}, ${restaurantId}::uuid, 'paused', 'Check flag')`;
      const [flag] = await tx`select current_setting('app.is_operator', true) as v`;
      return flag!["v"];
    });
    expect(seen).toBe("false");
  });
});
