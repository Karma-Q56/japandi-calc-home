// @vitest-environment node
// Real database tests for migration 0038 (monthly subscriptions, failed payments, 7 day grace,
// pausing campaigns). Added in review: the migration shipped with a text test only, and these
// functions run lazily, so a wrong column name would only have shown up on a live payment.
// Every date here is relative to "now", so the tests do not depend on the day or the hour.
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
  type Tx,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("monthly subscriptions (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const DAY_MS = 86_400_000;

  /** A restaurant with a pending monthly payment for the Growth plan. */
  async function subscriber(plan: "starter" | "managed" | "partner" = "managed", amountCents = 99900) {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const [row] = await db.owner<{ id: string }[]>`
      insert into payment (restaurant_id, kind, amount_cents, status, reference, plan, provider)
      values (${restaurantId}, 'subscription', ${amountCents}, 'pending', ${`sub_${token().slice(0, 20)}`}, ${plan}, 'payfast')
      returning id`;
    return { restaurantId, paymentId: row!.id, amountCents };
  }

  /** Settle a PayFast notice the way the webhook does: no restaurant, no guest. */
  async function settle(paymentId: string, amountCents: number, ref: string, outcome: string, tokenText: string | null = null) {
    return asApp(
      db.app,
      {},
      async (tx) => {
        const [row] = await tx`
          select settle_card_payment(${paymentId}::uuid, ${amountCents}::int, ${ref}, ${outcome}, ${tokenText})::text as r`;
        return row!["r"] as string;
      },
      { rollback: false },
    );
  }

  async function settleError(paymentId: string, amountCents: number, ref: string, outcome: string) {
    return asApp(db.app, {}, async (tx) => {
      try {
        await tx`select settle_card_payment(${paymentId}::uuid, ${amountCents}::int, ${ref}, ${outcome})`;
        return "ok";
      } catch (error) {
        return String(error);
      }
    });
  }

  async function sub(restaurantId: string) {
    const [row] = await db.owner<
      { state: string; plan: string; provider_token: string | null; next_due_at: Date | null; grace_ends_at: Date | null; past_due_since: Date | null }[]
    >`select state, plan::text as plan, provider_token, next_due_at, grace_ends_at, past_due_since
        from subscription where restaurant_id = ${restaurantId}`;
    return row;
  }

  async function paused(restaurantId: string): Promise<boolean> {
    const [row] = await db.owner<{ p: boolean }[]>`select billing_paused(${restaurantId}::uuid) as p`;
    return row!.p;
  }

  async function chargeCount(restaurantId: string): Promise<number> {
    const [row] = await db.owner<{ n: number }[]>`select count(*)::int as n from subscription_charge where restaurant_id = ${restaurantId}`;
    return row!.n;
  }

  it("the first payment starts the subscription, sets the plan, and a repeat notice counts once", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("managed");
    expect(await settle(paymentId, amountCents, "pf-first", "paid", "tok-first")).toBe("paid");
    const row = await sub(restaurantId);
    expect(row).toMatchObject({ state: "active", plan: "managed", provider_token: "tok-first" });
    const due = row!.next_due_at!.getTime() - Date.now();
    expect(due).toBeGreaterThan(27 * DAY_MS);
    expect(due).toBeLessThan(32 * DAY_MS);
    const [r] = await db.owner<{ plan: string }[]>`select plan::text as plan from restaurant where id = ${restaurantId}`;
    expect(r!.plan).toBe("managed");
    expect(await chargeCount(restaurantId)).toBe(1);
    expect(await settle(paymentId, amountCents, "pf-first", "paid", "tok-first")).toBe("already_paid");
    expect(await chargeCount(restaurantId)).toBe(1);
  });

  it("a wrong amount on the first payment is refused and nothing is settled", async () => {
    const { restaurantId, paymentId } = await subscriber("starter", 39900);
    expect(await settleError(paymentId, 100, "pf-bad", "paid")).toMatch(/amount_mismatch/);
    expect(await sub(restaurantId)).toBeUndefined();
  });

  it("a renewal moves the due date on once, and a repeated or wrong notice changes nothing", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("managed");
    await settle(paymentId, amountCents, "pf-r0", "paid", "tok-r");
    await db.owner`update subscription set next_due_at = now() - interval '1 day' where restaurant_id = ${restaurantId}`;
    expect(await settleError(paymentId, amountCents - 1, "pf-r1", "paid")).toMatch(/amount_mismatch/);
    expect(await settle(paymentId, amountCents, "pf-r1", "paid")).toBe("renewed");
    const after = await sub(restaurantId);
    expect(after!.state).toBe("active");
    expect(after!.next_due_at!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY_MS);
    expect(await chargeCount(restaurantId)).toBe(2);
    expect(await settle(paymentId, amountCents, "pf-r1", "paid")).toBe("already_paid");
    expect(await chargeCount(restaurantId)).toBe(2);
    // A renewal notice with no reference cannot be told apart from a repeat, so it is not counted.
    expect(await settle(paymentId, amountCents, "", "paid")).toBe("already_paid");
    expect(await chargeCount(restaurantId)).toBe(2);
  });

  it("a failed renewal gives a 7 day grace that a second failure does not extend, then pauses, and a payment lifts it", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("managed");
    await settle(paymentId, amountCents, "pf-g0", "paid", "tok-g");
    expect(await settle(paymentId, amountCents, "pf-g1", "failed")).toBe("past_due");
    const first = await sub(restaurantId);
    expect(first!.state).toBe("past_due");
    const grace = first!.grace_ends_at!.getTime() - Date.now();
    expect(grace).toBeGreaterThan(6 * DAY_MS);
    expect(grace).toBeLessThan(8 * DAY_MS);
    expect(await paused(restaurantId)).toBe(false);

    expect(await settle(paymentId, amountCents, "pf-g2", "failed")).toBe("past_due");
    const second = await sub(restaurantId);
    expect(second!.grace_ends_at!.getTime()).toBe(first!.grace_ends_at!.getTime());
    expect(second!.past_due_since!.getTime()).toBe(first!.past_due_since!.getTime());

    await db.owner`update subscription set grace_ends_at = now() - interval '1 hour' where restaurant_id = ${restaurantId}`;
    expect(await paused(restaurantId)).toBe(true);

    expect(await settle(paymentId, amountCents, "pf-g3", "paid")).toBe("renewed");
    const healed = await sub(restaurantId);
    expect(healed).toMatchObject({ state: "active", grace_ends_at: null, past_due_since: null });
    expect(await paused(restaurantId)).toBe(false);
  });

  it("a cancelled plan pauses sending only after its paid-up date has passed", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("partner", 199900);
    await settle(paymentId, amountCents, "pf-c0", "paid", "tok-c");
    expect(await settle(paymentId, amountCents, "pf-c1", "cancelled")).toBe("cancelled");
    expect((await sub(restaurantId))!.state).toBe("cancelled");
    expect(await paused(restaurantId)).toBe(false);
    await db.owner`update subscription set next_due_at = now() - interval '1 day' where restaurant_id = ${restaurantId}`;
    expect(await paused(restaurantId)).toBe(true);
  });

  it("an invoice more than 7 days overdue pauses sending, and a paid or void invoice does not", async () => {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    expect(await paused(restaurantId)).toBe(false);
    const [inv] = await db.owner<{ id: string }[]>`
      insert into invoice (restaurant_id, amount_cents, description, status, due_date)
      values (${restaurantId}, 50000, 'Set up', 'open', current_date - 7) returning id`;
    expect(await paused(restaurantId)).toBe(false); // exactly 7 days late is still inside the grace
    await db.owner`update invoice set due_date = current_date - 8 where id = ${inv!.id}`;
    expect(await paused(restaurantId)).toBe(true);
    await db.owner`update invoice set status = 'void' where id = ${inv!.id}`;
    expect(await paused(restaurantId)).toBe(false);
    await db.owner`update invoice set status = 'paid', paid_at = now() where id = ${inv!.id}`;
    expect(await paused(restaurantId)).toBe(false);
  });

  it("settling is refused for a restaurant or a guest, and for an unknown payment or outcome", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("starter", 39900);
    const guest = await makeGuest(db.owner, fixtures);
    for (const ctx of [{ restaurantId }, { customerId: guest.id }]) {
      const error = await asApp(db.app, ctx, async (tx) => {
        try {
          await tx`select settle_card_payment(${paymentId}::uuid, ${amountCents}::int, 'pf-x', 'paid')`;
          return "ok";
        } catch (e) {
          return String(e);
        }
      });
      expect(error).toMatch(/not_allowed/);
    }
    expect(await settleError(paymentId, amountCents, "pf-x", "sideways")).toMatch(/bad_outcome/);
    expect(await settleError(crypto.randomUUID(), amountCents, "pf-x", "paid")).toMatch(/payment_not_found/);
    expect(await sub(restaurantId)).toBeUndefined();
  });

  it("finds the monthly payment from a PayFast token, and only for the system", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("managed");
    const tokenText = `tok-${token().slice(0, 12)}`;
    await settle(paymentId, amountCents, "pf-t0", "paid", tokenText);
    const found = await asApp(db.app, {}, async (tx) => {
      const [row] = await tx`select find_subscription_payment(${tokenText}) as id`;
      const [none] = await tx`select find_subscription_payment('no-such-token') as id`;
      const [blank] = await tx`select find_subscription_payment('  ') as id`;
      const [missing] = await tx`select find_subscription_payment(null) as id`;
      return { id: row!["id"], none: none!["id"], blank: blank!["id"], missing: missing!["id"] };
    });
    expect(found).toEqual({ id: paymentId, none: null, blank: null, missing: null });
    const refused = await asApp(db.app, { restaurantId }, async (tx) => {
      try {
        await tx`select find_subscription_payment(${tokenText})`;
        return "ok";
      } catch (e) {
        return String(e);
      }
    });
    expect(refused).toMatch(/not_allowed/);
  });

  it("an owner cannot create a campaign while billing is paused, and can when it is not", async () => {
    const { restaurantId, paymentId, amountCents } = await subscriber("managed");
    const ownerId = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    await settle(paymentId, amountCents, "pf-p0", "paid", "tok-p");
    const create = () =>
      asApp(db.app, { restaurantId }, async (tx: Tx) => {
        try {
          await tx`select create_campaign(${restaurantId}::uuid, ${ownerId}, 'Weekend special', 'Come in this weekend',
            ${tx.json({ type: "everyone" })}, ${token().slice(0, 8).toUpperCase()}, null, 1)`;
          return "ok";
        } catch (e) {
          return String(e);
        }
      });
    expect(await create()).not.toMatch(/billing_paused/);
    await settle(paymentId, amountCents, "pf-p1", "failed");
    expect(await create()).not.toMatch(/billing_paused/); // inside the 7 day grace
    await db.owner`update subscription set grace_ends_at = now() - interval '1 minute' where restaurant_id = ${restaurantId}`;
    expect(await create()).toMatch(/billing_paused/);
  });

  it("the dispatcher does not claim a paused restaurant's campaign, and it stays scheduled", async () => {
    const good = await subscriber("managed");
    const bad = await subscriber("managed");
    await settle(good.paymentId, good.amountCents, "pf-d0", "paid", "tok-d0");
    await settle(bad.paymentId, bad.amountCents, "pf-d1", "paid", "tok-d1");
    await settle(bad.paymentId, bad.amountCents, "pf-d2", "failed");
    await db.owner`update subscription set grace_ends_at = now() - interval '1 hour' where restaurant_id = ${bad.restaurantId}`;
    const campaigns: Record<string, string> = {};
    for (const [name, restaurantId] of [["good", good.restaurantId], ["bad", bad.restaurantId]] as const) {
      const [row] = await db.owner<{ id: string }[]>`
        insert into campaign (restaurant_id, name, message_body, channel, audience, code, status, scheduled_at,
                              est_recipients, est_segments, est_cost_cents, created_by)
        values (${restaurantId}, 'Dispatch test', 'Hi there', 'sms', ${db.owner.json({ type: "everyone" })},
                ${token().slice(0, 8).toUpperCase()}, 'scheduled', now() - interval '1 hour', 1, 1, 0, 'test')
        returning id`;
      campaigns[name] = row!.id;
    }
    const claimed = await asApp(db.app, { operator: true }, async (tx) => {
      const rows = await tx<{ campaign_id: string }[]>`select campaign_id from claim_due_campaigns(now(), 500)`;
      return rows.map((r) => r.campaign_id);
    });
    expect(claimed).toContain(campaigns["good"]);
    expect(claimed).not.toContain(campaigns["bad"]);
    const [still] = await db.owner<{ status: string }[]>`select status::text as status from campaign where id = ${campaigns["bad"]!}`;
    expect(still!.status).toBe("scheduled");
    // Once the restaurant pays, the same campaign is picked up.
    await settle(bad.paymentId, bad.amountCents, "pf-d3", "paid");
    const later = await asApp(db.app, { operator: true }, async (tx) => {
      const rows = await tx<{ campaign_id: string }[]>`select campaign_id from claim_due_campaigns(now(), 500)`;
      return rows.map((r) => r.campaign_id);
    });
    expect(later).toContain(campaigns["bad"]);
  });

  it("keeps a restaurant's monthly plan private to it, and keeps the charge log and writes closed to the app role", async () => {
    const mine = await subscriber("managed");
    const theirs = await subscriber("managed");
    await settle(mine.paymentId, mine.amountCents, "pf-iso-1", "paid", "tok-iso-1");
    await settle(theirs.paymentId, theirs.amountCents, "pf-iso-2", "paid", "tok-iso-2");
    const seen = await asApp(db.app, { restaurantId: mine.restaurantId }, async (tx) => {
      const rows = await tx<{ restaurant_id: string }[]>`select restaurant_id from subscription`;
      return rows.map((r) => r.restaurant_id);
    });
    expect(seen).toContain(mine.restaurantId);
    expect(seen).not.toContain(theirs.restaurantId);
    // The charge log has no grant at all, and a restaurant cannot write or change its own plan row.
    const attempt = async (run: (tx: Tx) => Promise<unknown>) =>
      asApp(db.app, { restaurantId: mine.restaurantId }, async (tx) => {
        try {
          await run(tx);
          return "ok";
        } catch (e) {
          return String(e);
        }
      });
    expect(await attempt((tx) => tx`select count(*) from subscription_charge`)).toMatch(/permission denied/);
    expect(await attempt((tx) => tx`update subscription set state = 'active', grace_ends_at = null where restaurant_id = ${mine.restaurantId}`)).toMatch(/permission denied/);
    expect(await attempt((tx) => tx`insert into subscription (restaurant_id, plan, state) values (${theirs.restaurantId}, 'partner', 'active')`)).toMatch(/permission denied/);
  });

  it("claiming campaigns is refused unless the caller is the dispatcher", async () => {
    const { restaurantId } = await subscriber("managed");
    const error = await asApp(db.app, { restaurantId }, async (tx) => {
      try {
        await tx`select * from claim_due_campaigns(now(), 10)`;
        return "ok";
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toMatch(/not_allowed/);
  });

  it("the operator sets a monthly payment state by hand, with checks, and it is recorded", async () => {
    const op = await makeAppUser(db.owner, fixtures, { role: "operator" });
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const run = (state: string, note: string, caller = op) =>
      asApp(db.app, { operator: true }, async (tx) => {
        try {
          await tx`select operator_set_subscription_state(${caller}, ${restaurantId}::uuid, ${state}, ${note})`;
          return "ok";
        } catch (e) {
          return String(e);
        }
      });
    expect(await run("past_due", "Not allowed state")).toMatch(/bad_state/);
    expect(await run("active", "x")).toMatch(/bad_note/);
    const notOperator = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    expect(await run("active", "Paid by EFT", notOperator)).toMatch(/not_operator/);
    expect(await sub(restaurantId)).toBeUndefined();

    await asApp(db.app, { operator: true }, (tx) => tx`select operator_set_subscription_state(${op}, ${restaurantId}::uuid, 'active', 'Paid by EFT')`, { rollback: false });
    const active = await sub(restaurantId);
    expect(active!.state).toBe("active");
    expect(active!.next_due_at!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY_MS);

    const dueBefore = active!.next_due_at!.getTime();
    await asApp(db.app, { operator: true }, (tx) => tx`select operator_set_subscription_state(${op}, ${restaurantId}::uuid, 'cancelled', 'Asked to stop')`, { rollback: false });
    const cancelled = await sub(restaurantId);
    expect(cancelled!.state).toBe("cancelled");
    expect(cancelled!.next_due_at!.getTime()).toBe(dueBefore); // keeps the paid-up date
    const [row] = await db.owner<{ n: number }[]>`select count(*)::int as n from audit_event
      where restaurant_id = ${restaurantId} and action = 'subscription_set_by_operator'`;
    expect(row!.n).toBe(2);
    expect(
      await asApp(db.app, { operator: true }, async (tx) => {
        try {
          await tx`select operator_set_subscription_state(${op}, ${crypto.randomUUID()}::uuid, 'active', 'Unknown place')`;
          return "ok";
        } catch (e) {
          return String(e);
        }
      }),
    ).toMatch(/restaurant_not_found/);
  });
});
