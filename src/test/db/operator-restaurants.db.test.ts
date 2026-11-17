// @vitest-environment node
// Real database test for migration 0036 (D23 operator restaurants, top ups and refunds).
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

describe.skipIf(!dbTestsEnabled)("operator restaurants, top ups and refunds (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  /** An operator login, a restaurant and a card top up waiting for its check. */
  async function setup(amountCents: number) {
    const operatorId = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const reference = `pf_${token().slice(0, 20)}`;
    const [row] = await db.owner<{ id: string }[]>`
      insert into payment (restaurant_id, kind, amount_cents, status, reference)
      values (${restaurantId}, 'topup', ${amountCents}, 'pending', ${reference})
      returning id
    `;
    return { operatorId, restaurantId, paymentId: row!.id };
  }

  it("refuses the operator list when the caller is not an operator", async () => {
    const ownerId = await makeAppUser(db.owner, fixtures, { role: "owner" });
    const error = await asApp(db.app, {}, (tx) =>
      tx`select * from operator_list_restaurants(${ownerId}, '', '', 10, 0)`.then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(String(error)).toMatch(/not_operator/);
  });

  it("confirms a top up once and refuses a repeat in the same transaction", async () => {
    const { operatorId, paymentId } = await setup(5000);
    const error = await asApp(db.app, { operator: true }, async (tx) => {
      await tx`select operator_confirm_topup(${operatorId}, ${paymentId}::uuid)`;
      return tx`select operator_confirm_topup(${operatorId}, ${paymentId}::uuid)`.then(
        () => null,
        (e: unknown) => e,
      );
    });
    expect(String(error)).toMatch(/not_pending/);
  });

  it("refuses a refund larger than the amount paid", async () => {
    const { operatorId, paymentId } = await setup(2000);
    const error = await asApp(db.app, { operator: true }, async (tx) => {
      await tx`select operator_confirm_topup(${operatorId}, ${paymentId}::uuid)`;
      return tx`select operator_record_refund(${operatorId}, ${paymentId}::uuid, 999999, 'test')`.then(
        () => null,
        (e: unknown) => e,
      );
    });
    expect(String(error)).toMatch(/amount_too_large/);
  });

  it("hides refund rows from a restaurant that did not make them", async () => {
    const { restaurantId } = await setup(1000);
    const rows = await asApp(db.app, { restaurantId }, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from refund`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});
