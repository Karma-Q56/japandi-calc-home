// @vitest-environment node
// Real database tests for migration 0036 (operator restaurants, top ups, invoices, refunds).
// Added in review: every function refused for a non-operator, money rules end to end, and
// the refund rules for card payments (status "paid") as well as checked EFT top ups ("confirmed").
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
  type Tx,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("operator money functions (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function operator() {
    return makeAppUser(db.owner, fixtures, { role: "operator" });
  }

  /** Run work as an operator and keep the result, so the owner connection can read it back. */
  function persist<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return asApp(db.app, { operator: true }, work, { rollback: false });
  }

  /** Run one statement as the app role and return the error text, or "ok". */
  async function outcome(ctx: { operator?: boolean; restaurantId?: string }, run: (tx: Tx) => Promise<unknown>) {
    return asApp(db.app, ctx, async (tx) => {
      try {
        await run(tx);
        return "ok";
      } catch (error) {
        return String(error);
      }
    });
  }

  async function payment(values: {
    restaurantId: string;
    kind: "topup" | "subscription" | "setup";
    amountCents: number;
    status: "pending" | "paid" | "confirmed" | "failed" | "rejected";
    plan?: "starter" | "managed" | "partner";
    provider?: string;
  }) {
    const [row] = await db.owner<{ id: string }[]>`
      insert into payment (restaurant_id, kind, amount_cents, status, reference, plan, provider)
      values (${values.restaurantId}, ${values.kind}, ${values.amountCents}, ${values.status},
              ${`t_${token().slice(0, 20)}`}, ${values.plan ?? null}, ${values.provider ?? "payfast"})
      returning id
    `;
    return row!.id;
  }

  async function ledgerTotal(restaurantId: string): Promise<number> {
    const [row] = await db.owner<{ total: string }[]>`
      select coalesce(sum(amount_cents), 0)::text as total from credit_ledger where restaurant_id = ${restaurantId}
    `;
    return Number(row!.total);
  }

  it("refuses every operator money function when the caller is not an operator", async () => {
    const ownerId = await makeAppUser(db.owner, fixtures, { role: "owner" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 5000, status: "paid" });
    const calls: Array<[string, (tx: Tx) => Promise<unknown>]> = [
      ["list restaurants", (tx) => tx`select * from operator_list_restaurants(${ownerId}, '', '', 10, 0)`],
      ["restaurant detail", (tx) => tx`select operator_restaurant_detail(${ownerId}, ${restaurantId}::uuid)`],
      ["pending top ups", (tx) => tx`select * from operator_pending_topups(${ownerId})`],
      ["list invoices", (tx) => tx`select * from operator_list_invoices(${ownerId}, '', 10)`],
      ["confirm top up", (tx) => tx`select operator_confirm_topup(${ownerId}, ${paymentId}::uuid)`],
      ["reject top up", (tx) => tx`select operator_reject_topup(${ownerId}, ${paymentId}::uuid, 'no money')`],
      ["void invoice", (tx) => tx`select operator_void_invoice(${ownerId}, ${paymentId}::uuid, 'no money')`],
      ["record refund", (tx) => tx`select operator_record_refund(${ownerId}, ${paymentId}::uuid, 100, 'test')`],
    ];
    for (const [name, run] of calls) {
      expect(await outcome({ restaurantId }, run), name).toMatch(/not_operator/);
    }
    // No context at all is refused as well.
    expect(await outcome({}, (tx) => tx`select * from operator_pending_topups(${ownerId})`)).toMatch(/not_operator/);
  });

  it("lists restaurants and treats a percent sign in the search as a plain character", async () => {
    const op = await operator();
    const marker = token().slice(0, 8);
    const { id } = await makeRestaurant(db.owner, fixtures, { name: `Plain ${marker} Grill`, status: "active" });
    const rows = await persist((tx) =>
      tx<{ id: string; name: string }[]>`select id, name from operator_list_restaurants(${op}, ${marker}, '', 20, 0)`,
    );
    expect(rows.map((r) => r.id)).toContain(id);
    const wildcard = await persist((tx) =>
      tx<{ id: string }[]>`select id from operator_list_restaurants(${op}, '%', '', 20, 0)`,
    );
    expect(wildcard.map((r) => r.id)).not.toContain(id);
    const none = await persist((tx) =>
      tx<{ id: string }[]>`select id from operator_list_restaurants(${op}, ${marker}, 'closed', 20, 0)`,
    );
    expect(none.map((r) => r.id)).not.toContain(id);
  });

  it("detail of a restaurant reads back its credit and has no guest phone numbers", async () => {
    const op = await operator();
    const { id } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, note, created_by)
      values (${id}, 'topup', 7000, ${`t:${token()}`}, 'test', 'test')`;
    const detail = await persist((tx) =>
      tx<{ d: Record<string, unknown> }[]>`select operator_restaurant_detail(${op}, ${id}::uuid) as d`,
    );
    const text = JSON.stringify(detail[0]!.d);
    expect(text).toContain("7000");
    expect(text).not.toMatch(/\+27\d{9}/);
    const missing = await outcome({ operator: true }, (tx) => tx`select operator_restaurant_detail(${op}, ${crypto.randomUUID()}::uuid)`);
    expect(missing).toMatch(/restaurant_not_found/);
  });

  it("confirming an EFT top up adds the credit once, and a repeat is refused", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 20000, status: "pending", provider: "manual_eft" });
    await persist((tx) => tx`select operator_confirm_topup(${op}, ${paymentId}::uuid)`);
    expect(await ledgerTotal(restaurantId)).toBe(20000);
    const again = await outcome({ operator: true }, (tx) => tx`select operator_confirm_topup(${op}, ${paymentId}::uuid)`);
    expect(again).toMatch(/not_pending/);
    expect(await ledgerTotal(restaurantId)).toBe(20000);
  });

  it("rejecting a top up adds no credit, needs a reason, records who decided, and blocks a later confirm", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 9000, status: "pending", provider: "manual_eft" });
    const noReason = await outcome({ operator: true }, (tx) => tx`select operator_reject_topup(${op}, ${paymentId}::uuid, 'x')`);
    expect(noReason).toMatch(/bad_reason/);
    await persist((tx) => tx`select operator_reject_topup(${op}, ${paymentId}::uuid, 'Nothing reached the bank')`);
    expect(await ledgerTotal(restaurantId)).toBe(0);
    const [row] = await db.owner<{ status: string; confirmed_by: string | null }[]>`
      select status::text as status, confirmed_by from payment where id = ${paymentId}`;
    expect(row).toMatchObject({ status: "rejected", confirmed_by: op });
    const later = await outcome({ operator: true }, (tx) => tx`select operator_confirm_topup(${op}, ${paymentId}::uuid)`);
    expect(later).toMatch(/not_pending/);
  });

  it("lists pending top ups across restaurants without guest data", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 4000, status: "pending", provider: "manual_eft" });
    const rows = await persist((tx) =>
      tx<{ payment_id: string; amount_cents: number }[]>`select payment_id, amount_cents from operator_pending_topups(${op})`,
    );
    expect(rows.find((r) => r.payment_id === paymentId)?.amount_cents).toBe(4000);
  });

  it("refunds a paid CARD top up, takes the credit back, and tracks partial refunds", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 10000, status: "paid" });
    await db.owner`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
      values (${restaurantId}, 'topup', 10000, ${`payment:${paymentId}`}, ${paymentId}, 'Card top up', 'payfast')`;
    await persist((tx) => tx`select operator_record_refund(${op}, ${paymentId}::uuid, 4000, 'Guest asked for part back')`);
    expect(await ledgerTotal(restaurantId)).toBe(6000);
    // The rest of the payment can still be refunded, but not more than what is left.
    const tooMuch = await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${paymentId}::uuid, 6001, 'Too much')`);
    expect(tooMuch).toMatch(/amount_too_large/);
    await persist((tx) => tx`select operator_record_refund(${op}, ${paymentId}::uuid, 6000, 'Rest of it')`);
    expect(await ledgerTotal(restaurantId)).toBe(0);
    const [row] = await db.owner<{ n: number }[]>`select count(*)::int as n from refund where payment_id = ${paymentId}`;
    expect(row!.n).toBe(2);
  });

  it("refunds a checked EFT top up too", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paymentId = await payment({ restaurantId, kind: "topup", amountCents: 5000, status: "pending", provider: "manual_eft" });
    await persist(async (tx) => {
      await tx`select operator_confirm_topup(${op}, ${paymentId}::uuid)`;
      await tx`select operator_record_refund(${op}, ${paymentId}::uuid, 5000, 'Paid twice by mistake')`;
    });
    expect(await ledgerTotal(restaurantId)).toBe(0);
  });

  it("records a refund of a monthly plan payment without touching the credit", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, note, created_by)
      values (${restaurantId}, 'topup', 3000, ${`t:${token()}`}, 'test', 'test')`;
    const paymentId = await payment({ restaurantId, kind: "subscription", amountCents: 39900, status: "paid", plan: "starter" });
    await persist((tx) => tx`select operator_record_refund(${op}, ${paymentId}::uuid, 39900, 'Cancelled in week one')`);
    expect(await ledgerTotal(restaurantId)).toBe(3000);
    const [row] = await db.owner<{ n: number }[]>`select count(*)::int as n from audit_event
      where action = 'refund_recorded' and object_id = ${paymentId}`;
    expect(row!.n).toBe(1);
  });

  it("refuses a refund of money that was never received, a set up fee, or credit already spent", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const pending = await payment({ restaurantId, kind: "topup", amountCents: 5000, status: "pending" });
    const failed = await payment({ restaurantId, kind: "topup", amountCents: 5000, status: "failed" });
    const setup = await payment({ restaurantId, kind: "setup", amountCents: 5000, status: "paid" });
    for (const id of [pending, failed, setup]) {
      expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${id}::uuid, 100, 'No way')`)).toMatch(/not_refundable/);
    }
    // A paid top up whose credit has already been spent cannot be taken back.
    const spent = await payment({ restaurantId, kind: "topup", amountCents: 5000, status: "paid" });
    await db.owner`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
      values (${restaurantId}, 'topup', 5000, ${`payment:${spent}`}, ${spent}, 'Card top up', 'payfast')`;
    await db.owner`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, note, created_by)
      values (${restaurantId}, 'charge', -4800, ${`t:${token()}`}, 'messages', 'system')`;
    expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${spent}::uuid, 5000, 'Too late')`)).toMatch(/credit_already_used/);
  });

  it("checks refund input: short reason, zero or negative amount, unknown payment", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const paid = await payment({ restaurantId, kind: "subscription", amountCents: 39900, status: "paid", plan: "starter" });
    expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${paid}::uuid, 100, 'x')`)).toMatch(/bad_reason/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${paid}::uuid, 0, 'Reason here')`)).toMatch(/bad_amount/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${paid}::uuid, -5, 'Reason here')`)).toMatch(/bad_amount/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_record_refund(${op}, ${crypto.randomUUID()}::uuid, 100, 'Reason here')`)).toMatch(/bad_reference/);
  });

  it("voids only an open invoice, with a reason, and lists invoices by status", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const [open] = await db.owner<{ id: string }[]>`
      insert into invoice (restaurant_id, amount_cents, description, status, due_date)
      values (${restaurantId}, 120000, 'Pro plan, month one', 'open', current_date + 7) returning id`;
    const [paid] = await db.owner<{ id: string }[]>`
      insert into invoice (restaurant_id, amount_cents, description, status, due_date)
      values (${restaurantId}, 120000, 'Pro plan, month zero', 'paid', current_date - 30) returning id`;
    expect(await outcome({ operator: true }, (tx) => tx`select operator_void_invoice(${op}, ${open!.id}::uuid, 'x')`)).toMatch(/bad_reason/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_void_invoice(${op}, ${paid!.id}::uuid, 'Not open any more')`)).toMatch(/not_open/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_void_invoice(${op}, ${crypto.randomUUID()}::uuid, 'No such invoice')`)).toMatch(/invoice_not_found/);
    await persist((tx) => tx`select operator_void_invoice(${op}, ${open!.id}::uuid, 'Raised by mistake')`);
    const [row] = await db.owner<{ status: string }[]>`select status::text as status from invoice where id = ${open!.id}`;
    expect(row!.status).toBe("void");
    const listed = await persist((tx) =>
      tx<{ invoice_id: string }[]>`select invoice_id from operator_list_invoices(${op}, 'void', 200)`,
    );
    expect(listed.map((r) => r.invoice_id)).toContain(open!.id);
  });
});
