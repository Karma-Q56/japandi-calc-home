import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode, requireDatabaseUrl } from "./db/mode";
import { planBilling } from "../config/plans";
import { readPayFastConfig } from "./billing/payfast";
import { createPayFastProvider } from "./billing/payfast-provider";
import { refusalCode } from "./live-ops";
import {
  billingBannerKind,
  isBillingPaused,
  type BillingBannerKind,
  type SubscriptionView,
} from "../lib/live-billing";

// Live plans, billing and payments (phase D21). Demo mode never imports this file.
//
// SECURITY:
// - The restaurant comes from the server session. Owner or manager only.
// - Amounts and plans come from src/config/plans.ts and the restaurant row, never the browser.
// - Writes go through SECURITY DEFINER functions (migration 0032).

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

const iso = (value: Date | string) => new Date(value).toISOString();

export type BillingPayment = {
  id: string;
  kind: string;
  amountCents: number;
  status: string;
  createdAt: string;
};

export type BillingInvoice = {
  id: string;
  amountCents: number;
  description: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
};

export type LiveBilling = {
  planName: string;
  planCode: string;
  monthlyCents: number | null;
  maxLocations: number;
  activeLocations: number;
  creditBalanceCents: number;
  paymentsOn: boolean;
  /** True once a monthly card payment has gone through. Patron changes it from then on. */
  hasMonthlyPayment: boolean;
  payments: BillingPayment[];
  invoices: BillingInvoice[];
  bankingDetails: string | null;
  /** The monthly card payment state. Null when the restaurant has never paid monthly by card. */
  subscription: SubscriptionView | null;
  /** True when campaign sending is paused (see isBillingPaused). */
  campaignsPaused: boolean;
};

const planKey = (plan: string) => (plan === "managed" ? "Growth" : plan === "partner" ? "Pro" : "Starter");

/**
 * The banner every owner screen shows. It runs on every page load, so it reads only the two things
 * it needs (the monthly payment row and the open invoice dates) and none of the payment history.
 * It never stops a page from loading: if the read fails the banner is simply not shown. Sending is
 * paused by the database itself (billing_paused), so a missing banner never lets a paused
 * restaurant send.
 */
export async function getLiveBillingBanner(
  viewer: Viewer,
): Promise<{ kind: BillingBannerKind; graceEndsAt: string | null }> {
  const none = { kind: "none" as const, graceEndsAt: null };
  if (getDataMode() !== "live" || !canManage(viewer)) return none;
  const restaurantId = viewer.restaurantId;
  try {
    return await withContext(
      { databaseUrl: requireDatabaseUrl(), restaurantId, isOperator: false },
      async (transaction) => {
        const subRes = await transaction.execute<{
          state: "active" | "past_due" | "cancelled";
          grace_ends_at: Date | string | null;
          next_due_at: Date | string | null;
        }>(sql`
          select state, grace_ends_at, next_due_at from subscription where restaurant_id = ${restaurantId}
        `);
        const overdueRes = await transaction.execute<{ due_date: string }>(sql`
          select due_date::text as due_date from invoice
          where restaurant_id = ${restaurantId} and status = 'open'
        `);
        const row = subRes.rows[0];
        const subscription: SubscriptionView | null = row
          ? {
              state: row.state,
              graceEndsAt: row.grace_ends_at ? iso(row.grace_ends_at) : null,
              nextDueAt: row.next_due_at ? iso(row.next_due_at) : null,
            }
          : null;
        const paused = isBillingPaused(
          subscription,
          overdueRes.rows.map((item) => item.due_date),
        );
        return {
          kind: billingBannerKind(subscription, paused),
          graceEndsAt: subscription?.state === "past_due" ? subscription.graceEndsAt : null,
        };
      },
    );
  } catch {
    return none;
  }
}

/** Everything the "Plan and billing" screen shows, for the signed-in owner's restaurant. */
export async function getLiveBilling(viewer: Viewer): Promise<LiveBilling | null> {
  if (getDataMode() !== "live" || !canManage(viewer)) return null;
  const restaurantId = viewer.restaurantId;
  return withContext(
    { databaseUrl: requireDatabaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const restaurantRes = await transaction.execute<{ plan: string }>(sql`
        select plan::text as plan from restaurant where id = ${restaurantId}
      `);
      const locationsRes = await transaction.execute<{ n: number }>(sql`
        select count(*)::int as n from location where restaurant_id = ${restaurantId} and active
      `);
      const balanceRes = await transaction.execute<{ balance: number }>(sql`
        select coalesce(sum(amount_cents), 0)::int as balance
        from credit_ledger where restaurant_id = ${restaurantId}
      `);
      const paymentsRes = await transaction.execute<{
        id: string;
        kind: string;
        amount_cents: number;
        status: string;
        created_at: Date | string;
      }>(sql`
        select id, kind::text as kind, amount_cents, status::text as status, created_at
        from payment where restaurant_id = ${restaurantId}
        order by created_at desc limit 50
      `);
      const invoicesRes = await transaction.execute<{
        id: string;
        amount_cents: number;
        description: string;
        due_date: string;
        status: string;
        paid_at: Date | string | null;
      }>(sql`
        select id, amount_cents, description, due_date::text as due_date, status, paid_at
        from invoice where restaurant_id = ${restaurantId}
        order by created_at desc limit 50
      `);
      const subRes = await transaction.execute<{
        state: "active" | "past_due" | "cancelled";
        grace_ends_at: Date | string | null;
        next_due_at: Date | string | null;
      }>(sql`
        select state, grace_ends_at, next_due_at from subscription where restaurant_id = ${restaurantId}
      `);
      const subRow = subRes.rows[0];
      const subscription: SubscriptionView | null = subRow
        ? {
            state: subRow.state,
            graceEndsAt: subRow.grace_ends_at ? iso(subRow.grace_ends_at) : null,
            nextDueAt: subRow.next_due_at ? iso(subRow.next_due_at) : null,
          }
        : null;
      const overdueRes = await transaction.execute<{ due_date: string }>(sql`
        select due_date::text as due_date from invoice
        where restaurant_id = ${restaurantId} and status = 'open'
      `);
      const planCode = restaurantRes.rows[0]?.plan ?? "starter";
      const name = planKey(planCode);
      const limits = planBilling[name]!;
      return {
        subscription,
        campaignsPaused: isBillingPaused(
          subscription,
          overdueRes.rows.map((row) => row.due_date),
        ),
        planName: name,
        planCode,
        monthlyCents: limits.monthlyCents,
        maxLocations: limits.maxLocations,
        activeLocations: locationsRes.rows[0]?.n ?? 0,
        creditBalanceCents: balanceRes.rows[0]?.balance ?? 0,
        paymentsOn: readPayFastConfig() !== null,
        hasMonthlyPayment: paymentsRes.rows.some((p) => p.kind === "subscription" && p.status === "paid"),
        payments: paymentsRes.rows.map((p) => ({
          id: p.id,
          kind: p.kind,
          amountCents: p.amount_cents,
          status: p.status,
          createdAt: iso(p.created_at),
        })),
        invoices: invoicesRes.rows.map((i) => ({
          id: i.id,
          amountCents: i.amount_cents,
          description: i.description,
          dueDate: i.due_date,
          status: i.status,
          paidAt: i.paid_at ? iso(i.paid_at) : null,
        })),
        bankingDetails: process.env["PATRON_BANK_DETAILS"] ?? null,
      };
    },
  );
}

/** Operator creates a managed invoice. Operator only; the id comes from the session. */
export async function createLiveInvoice(
  viewer: Viewer | null,
  input: { restaurantId: string; amountCents: number; description: string; dueDate: string },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!viewer || viewer.role !== "operator") return { ok: false, message: "Only Patron staff can do this." };
  const id = await withContext(
    { databaseUrl: requireDatabaseUrl(), restaurantId: null, isOperator: false },
    async (transaction) => {
      const rowRes = await transaction.execute<{ id: string }>(sql`
        select operator_create_invoice(
          ${viewer.userId}, ${input.restaurantId}::uuid, ${input.amountCents}::int,
          ${input.description}, ${input.dueDate}::date
        )::text as id
      `);
      return rowRes.rows[0]?.id ?? null;
    },
  );
  return id ? { ok: true, id } : { ok: false, message: "The invoice was not created." };
}

export type StartPaymentResult =
  | { ok: true; url: string; fields: Array<[string, string]> }
  | { ok: false; message: string };

const PAYMENT_MESSAGES: Record<string, string> = {
  subscription_exists:
    "Your monthly payment is already set up. To change your plan or stop it, ask Patron.",
  plan_limit_locations: "You have more open locations than that plan allows. Close the extra ones first.",
  bad_amount: "Choose a top up between R100 and R100 000.",
};

const TOO_MANY = "That is a lot of tries in a short time. Please wait a little and try again.";

/** At most `limit` payment starts per person per hour, counted in the database. */
async function withinPaymentLimit(userId: string, limit: number): Promise<boolean> {
  return withContext({ databaseUrl: requireDatabaseUrl(), isOperator: false }, async (transaction) => {
    const used = await transaction.execute<{ n: number }>(sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = 'pay-start' and key = ${userId} and created_at > now() - interval '1 hour'
    `);
    if (Number(used.rows[0]?.n ?? 0) >= limit) return false;
    await transaction.execute(sql`insert into rate_limit_hit (bucket, key) values ('pay-start', ${userId})`);
    return true;
  });
}

/**
 * Starts a PayFast checkout for a monthly plan or a credit top-up. The amount is built
 * here from plan data. Refuses clearly when payments are not switched on.
 * `origin` is the public address of this site, read from the request on the server.
 */
export async function startLivePayment(
  viewer: Viewer,
  request: { kind: "subscription"; planName: string } | { kind: "topup"; topupCents: number },
  origin: string,
): Promise<StartPaymentResult> {
  if (!canManage(viewer)) return { ok: false, message: "Only the owner or a manager can pay." };
  const config = readPayFastConfig();
  if (!config) return { ok: false, message: "Online payments are not switched on yet." };

  let amountCents: number;
  let itemName: string;
  let planTier: "starter" | "managed" | null = null;
  if (request.kind === "subscription") {
    const plan = planBilling[request.planName];
    if (!plan || plan.monthlyCents === null || (plan.tier !== "starter" && plan.tier !== "managed")) {
      return { ok: false, message: "That plan cannot be paid online. Ask Patron." };
    }
    amountCents = plan.monthlyCents;
    itemName = `Patron ${request.planName} plan`;
    planTier = plan.tier;
  } else {
    const topup = request.topupCents;
    if (!Number.isInteger(topup) || topup < 10000 || topup > 10000000) {
      return { ok: false, message: "Choose a top up between R100 and R100 000." };
    }
    amountCents = topup;
    itemName = "Patron SMS credit top up";
  }

  if (!(await withinPaymentLimit(viewer.userId, 20))) return { ok: false, message: TOO_MANY };

  const reference = `pf_${randomBytes(12).toString("hex")}`;
  let paymentId: string | null;
  try {
    paymentId = await withContext(
      { databaseUrl: requireDatabaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        const rowRes = await transaction.execute<{ id: string }>(sql`
          select create_card_payment(
            ${viewer.restaurantId}::uuid, ${request.kind}::payment_kind, ${amountCents}::int, ${reference},
            ${planTier}::plan_tier
          )::text as id
        `);
        return rowRes.rows[0]?.id ?? null;
      },
    );
  } catch (error) {
    const code = refusalCode(error);
    return { ok: false, message: (code && PAYMENT_MESSAGES[code]) || "We could not start the payment. Try again." };
  }
  if (!paymentId) return { ok: false, message: "We could not start the payment. Try again." };

  const checkout = createPayFastProvider(config).createCheckout({
    paymentId,
    kind: request.kind,
    amountCents,
    itemName,
    restaurantId: viewer.restaurantId,
    ownerEmail: viewer.email ?? "",
    returnUrl: `${origin}/app/billing?paid=1`,
    cancelUrl: `${origin}/app/billing?cancelled=1`,
    notifyUrl: `${origin}/api/webhooks/payments`,
  });
  return { ok: true, url: checkout.url, fields: checkout.fields };
}
