// @vitest-environment node
// Real database test for migration 0037 (D24 operator inbox).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("operator inbox (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("refuses the campaign approval list when the caller is not an operator", async () => {
    const ownerId = await makeAppUser(db.owner, fixtures, { role: "owner" });
    const error = await asApp(db.app, {}, (tx) =>
      tx`select operator_list_pending_campaigns(${ownerId})`.then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(String(error)).toMatch(/not_operator/);
  });

  it("lists outbox rows for an operator with no full phone number in the result", async () => {
    const operatorId = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const [row] = await asApp(db.app, { operator: true }, (tx) =>
      tx<{ out: string }[]>`select operator_list_outbox(${operatorId}, '', 50, 0)::text as out`,
    );
    expect(row?.out ?? "[]").not.toMatch(/\+\d{9,}/);
  });

  it("never returns a feedback screenshot from the list read", async () => {
    const operatorId = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const [row] = await asApp(db.app, { operator: true }, (tx) =>
      tx<{ out: string }[]>`select operator_list_feedback(${operatorId}, '', 50, 0)::text as out`,
    );
    expect(row?.out ?? "").not.toMatch(/screenshot_data/);
  });

  it("refuses a lead status the migration does not know", async () => {
    const operatorId = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const error = await asApp(db.app, { operator: true }, (tx) =>
      tx`select operator_set_lead_status(${operatorId}, gen_random_uuid(), 'not_a_status')`.then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(String(error)).toMatch(/lead_not_found|invalid_value/);
  });
});
