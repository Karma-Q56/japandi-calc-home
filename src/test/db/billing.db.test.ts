// @vitest-environment node
// Real database test for migration 0032 (plans, billing and payments, D21).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeGuest,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("plans, billing and payments (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  /** A restaurant with an owner login and a card payment waiting for its ITN. */
  async function pendingTopup(amountCents: number) {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const owner = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    const reference = `pf_${token().slice(0, 20)}`;
    const paymentId = await asApp(
      db.app,
      { restaurantId },
      async (tx) => {
        const [row] = await tx`
          select create_card_payment(${restaurantId}::uuid, 'topup'::payment_kind, ${amountCents}::int, ${reference})::text as id`;
        return row!["id"] as string;
      },
      { rollback: false },
    );
    return { restaurantId, owner, paymentId };
  }

  async function balance(restaurantId: string): Promise<number> {
    const [row] = await db.owner`
      select coalesce(sum(amount_cents), 0)::int as b from credit_ledger where restaurant_id = ${restaurantId}`;
    return row!["b"] as number;
  }

  async function settle(paymentId: string, amountCents: number, outcome: string, providerRef = "pf-1") {
    return asApp(
      db.app,
      { operator: false },
      async (tx) => {
        const [row] = await tx`
          select settle_card_payment(${paymentId}::uuid, ${amountCents}::int, ${providerRef}, ${outcome})::text as r`;
        return row!["r"] as string;
      },
      { rollback: false },
    );
  }

  it("a paid top up credits the balance once, however many times the ITN arrives", async () => {
    const { restaurantId, paymentId } = await pendingTopup(50000);
    expect(await settle(paymentId, 50000, "paid")).toBe("paid");
    expect(await settle(paymentId, 50000, "paid")).toBe("already_paid");
    expect(await settle(paymentId, 50000, "paid")).toBe("already_paid");
    expect(await balance(restaurantId)).toBe(50000);
    const [entries] = await db.owner`
      select count(*)::int as n from credit_ledger
      where restaurant_id = ${restaurantId} and reference = ${"payment:" + paymentId}`;
    expect(entries!["n"]).toBe(1);
  });

  it("refuses a wrong amount and writes nothing", async () => {
    const { restaurantId, paymentId } = await pendingTopup(50000);
    await expect(settle(paymentId, 49999, "paid")).rejects.toThrow(/amount_mismatch/);
    const [row] = await db.owner`select status::text as s from payment where id = ${paymentId}`;
    expect(row!["s"]).toBe("pending");
    expect(await balance(restaurantId)).toBe(0);
  });

  it("a failed or cancelled payment leaves the balance unchanged", async () => {
    const { restaurantId, paymentId } = await pendingTopup(20000);
    expect(await settle(paymentId, 20000, "failed")).toBe("ignored");
    const [row] = await db.owner`select status::text as s from payment where id = ${paymentId}`;
    expect(row!["s"]).toBe("failed");
    expect(await balance(restaurantId)).toBe(0);
  });

  it("an unknown payment id is refused", async () => {
    await expect(settle("00000000-0000-0000-0000-000000000000", 100, "paid")).rejects.toThrow(
      /payment_not_found/,
    );
  });

  it("an owner cannot start a payment for another restaurant", async () => {
    const { id: mine } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: theirs } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await expect(
      asApp(
        db.app,
        { restaurantId: mine },
        (tx) =>
          tx`select create_card_payment(${theirs}::uuid, 'topup'::payment_kind, 50000, ${"pf_" + token().slice(0, 20)})`,
        { rollback: false },
      ),
    ).rejects.toThrow(/not_allowed/);
  });

  it("a payment request refuses a zero amount", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await expect(
      asApp(
        db.app,
        { restaurantId },
        (tx) =>
          tx`select create_card_payment(${restaurantId}::uuid, 'topup'::payment_kind, 0, ${"pf_" + token().slice(0, 20)})`,
        { rollback: false },
      ),
    ).rejects.toThrow(/bad_amount/);
  });

  it("the location limit stops a new active location past the plan limit", async () => {
    // Starter allows one active location. A new restaurant already has its main
    // location (migration 0015), so any further active location must be refused.
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set plan = 'starter' where id = ${restaurantId}`;
    await expect(
      db.owner`insert into location (restaurant_id, name) values (${restaurantId}, 'Second')`,
    ).rejects.toThrow(/plan_limit_locations/);
  });

  it("an operator marks an invoice paid once and it credits the balance once", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const operator = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const [inv] = await db.owner`
      insert into invoice (restaurant_id, amount_cents, description, due_date)
      values (${restaurantId}, 120000, 'Growth plan, May', current_date + 14)
      returning id`;
    const invoiceId = inv!["id"] as string;
    const mark = () =>
      asApp(
        db.app,
        { operator: true },
        async (tx) => {
          const [row] = await tx`
            select operator_mark_invoice_paid(${operator}, ${invoiceId}::uuid, 'EFT-0001', 'Bank deposit seen')::text as r`;
          return row!["r"] as string;
        },
        { rollback: false },
      );
    expect(await mark()).toBe("paid");
    await expect(mark()).rejects.toThrow(/already_paid/);
    expect(await balance(restaurantId)).toBe(120000);
  });

  it("an owner cannot read or pay another restaurant's invoice", async () => {
    const { id: mine } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const { id: theirs } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const [inv] = await db.owner`
      insert into invoice (restaurant_id, amount_cents, description, due_date)
      values (${theirs}, 120000, 'Their invoice', current_date + 14) returning id`;
    const rows = await asApp(db.app, { restaurantId: mine }, (tx) =>
      tx`select id from invoice where id = ${inv!["id"] as string}::uuid`,
    );
    expect(rows.length).toBe(0);
  });

  it("a guest cannot mark an invoice paid", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeAppUser(db.owner, fixtures, { role: "guest" });
    const [inv] = await db.owner`
      insert into invoice (restaurant_id, amount_cents, description, due_date)
      values (${restaurantId}, 120000, 'Growth plan', current_date + 14) returning id`;
    await expect(
      asApp(db.app, { operator: true }, (tx) =>
        tx`select operator_mark_invoice_paid(${guest}, ${inv!["id"] as string}::uuid, 'EFT-9', 'try it')`,
      ),
    ).rejects.toThrow(/not_operator/);
    expect(await balance(restaurantId)).toBe(0);
  });

  it("a signed-in owner or guest cannot settle a payment, even their own", async () => {
    const { restaurantId, paymentId } = await pendingTopup(50000);
    await expect(
      asApp(
        db.app,
        { restaurantId },
        (tx) => tx`select settle_card_payment(${paymentId}::uuid, 50000, 'pf-x', 'paid')`,
        { rollback: false },
      ),
    ).rejects.toThrow(/not_allowed/);
    const guest = await makeGuest(db.owner, fixtures);
    await expect(
      asApp(
        db.app,
        { customerId: guest.id },
        (tx) => tx`select settle_card_payment(${paymentId}::uuid, 50000, 'pf-x', 'paid')`,
        { rollback: false },
      ),
    ).rejects.toThrow(/not_allowed/);
    const [row] = await db.owner`select status::text as s from payment where id = ${paymentId}`;
    expect(row!["s"]).toBe("pending");
    expect(await balance(restaurantId)).toBe(0);
  });

  it("refuses an outcome it does not know", async () => {
    const { paymentId } = await pendingTopup(20000);
    await expect(settle(paymentId, 20000, "refunded")).rejects.toThrow(/bad_outcome/);
  });

  /** Starts a monthly payment as the owner of the restaurant. */
  function startMonthly(restaurantId: string, plan: string | null, amountCents = 120000) {
    return asApp(
      db.app,
      { restaurantId },
      async (tx) => {
        const [row] = await tx`
          select create_card_payment(${restaurantId}::uuid, 'subscription'::payment_kind, ${amountCents}::int,
            ${"pf_" + token().slice(0, 20)}, ${plan}::plan_tier)::text as id`;
        return row!["id"] as string;
      },
      { rollback: false },
    );
  }

  it("a paid monthly payment switches the restaurant to its plan, once", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set plan = 'starter' where id = ${restaurantId}`;
    const paymentId = await startMonthly(restaurantId, "managed");
    const [before] = await db.owner`select plan::text as p from restaurant where id = ${restaurantId}`;
    expect(before!["p"]).toBe("starter");
    expect(await settle(paymentId, 120000, "paid")).toBe("paid");
    expect(await settle(paymentId, 120000, "paid")).toBe("already_paid");
    const [after] = await db.owner`select plan::text as p from restaurant where id = ${restaurantId}`;
    expect(after!["p"]).toBe("managed");
    expect(await balance(restaurantId)).toBe(0);
  });

  it("a second monthly payment is refused while one is paid, and an unpaid one does not block", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const abandoned = await startMonthly(restaurantId, "starter", 39900);
    const paymentId = await startMonthly(restaurantId, "managed");
    expect(abandoned).not.toBe(paymentId);
    expect(await settle(paymentId, 120000, "paid")).toBe("paid");
    await expect(startMonthly(restaurantId, "starter", 39900)).rejects.toThrow(/subscription_exists/);
  });

  it("a monthly payment must name a plan that is paid online, and a top up must not name one", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await expect(startMonthly(restaurantId, null)).rejects.toThrow(/bad_plan/);
    await expect(startMonthly(restaurantId, "partner")).rejects.toThrow(/bad_plan/);
    await expect(
      asApp(
        db.app,
        { restaurantId },
        (tx) =>
          tx`select create_card_payment(${restaurantId}::uuid, 'topup'::payment_kind, 50000, ${"pf_" + token().slice(0, 20)}, 'managed'::plan_tier)`,
        { rollback: false },
      ),
    ).rejects.toThrow(/bad_plan/);
  });

  it("a plan with fewer locations than the restaurant has open is refused", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set plan = 'managed' where id = ${restaurantId}`;
    await db.owner`insert into location (restaurant_id, name) values (${restaurantId}, 'Second')`;
    await expect(startMonthly(restaurantId, "starter", 39900)).rejects.toThrow(/plan_limit_locations/);
  });

  it("the app role can read invoices but not write them directly", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await expect(
      asApp(
        db.app,
        { restaurantId },
        (tx) =>
          tx`insert into invoice (restaurant_id, amount_cents, description, due_date)
             values (${restaurantId}::uuid, 100000, 'Self made', current_date)`,
        { rollback: false },
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("an owner cannot see another restaurant's payments", async () => {
    const { restaurantId: theirs } = await pendingTopup(50000);
    const { id: mine } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const rows = await asApp(db.app, { restaurantId: mine }, (tx) =>
      tx`select id from payment where restaurant_id = ${theirs}::uuid`,
    );
    expect(rows.length).toBe(0);
  });
});
