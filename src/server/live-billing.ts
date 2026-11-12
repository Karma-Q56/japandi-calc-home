import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode, requireDatabaseUrl } from "./db/mode";
import { planBilling } from "../config/plans";
import { readPayFastConfig } from "./billing/payfast";
import { createPayFastProvider } from "./billing/payfast-provider";

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
  includedSmsCredit: number;
  maxLocations: number;
  activeLocations: number;
  creditBalanceCents: number;
  paymentsOn: boolean;
  payments: BillingPayment[];
  invoices: BillingInvoice[];
  bankingDetails: string | null;
};

const planKey = (plan: string) => (plan === "managed" ? "Growth" : plan === "partner" ? "Pro" : "Starter");

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
      const planCode = restaurantRes.rows[0]?.plan ?? "starter";
      const name = planKey(planCode);
      const limits = planBilling[name]!;
      return {
        planName: name,
        planCode,
        monthlyCents: limits.monthlyCents,
        includedSmsCredit: limits.includedSmsCredit,
        maxLocations: limits.maxLocations,
        activeLocations: locationsRes.rows[0]?.n ?? 0,
        creditBalanceCents: balanceRes.rows[0]?.balance ?? 0,
        paymentsOn: readPayFastConfig() !== null,
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

/**
 * Starts a PayFast checkout for a monthly plan or a credit top-up. The amount is built
 * here from plan data. Refuses clearly when payments are not switched on.
 */
export async function startLivePayment(
  viewer: Viewer,
  request: { kind: "subscription" | "topup"; topupCents?: number; planName?: string },
  origin: string,
): Promise<StartPaymentResult> {
  if (!canManage(viewer)) return { ok: false, message: "Only the owner or a manager can pay." };
  const config = readPayFastConfig();
  if (!config) return { ok: false, message: "Online payments are not switched on yet." };

  let amountCents: number;
  let itemName: string;
  if (request.kind === "subscription") {
    const plan = planBilling[request.planName ?? ""];
    if (!plan || plan.monthlyCents === null) {
      return { ok: false, message: "That plan cannot be paid online. Ask Patron." };
    }
    amountCents = plan.monthlyCents;
    itemName = `Patron ${request.planName} plan`;
  } else {
    const topup = request.topupCents ?? 0;
    if (!Number.isInteger(topup) || topup < 10000 || topup > 10000000) {
      return { ok: false, message: "Choose a top up between R100 and R100 000." };
    }
    amountCents = topup;
    itemName = "Patron SMS credit top up";
  }

  const reference = `pf_${randomBytes(12).toString("hex")}`;
  const paymentId = await withContext(
    { databaseUrl: requireDatabaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const rowRes = await transaction.execute<{ id: string }>(sql`
        select create_card_payment(
          ${viewer.restaurantId}::uuid, ${request.kind}::payment_kind, ${amountCents}::int, ${reference}
        )::text as id
      `);
      return rowRes.rows[0]?.id ?? null;
    },
  );
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
