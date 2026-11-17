import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode, requireDatabaseUrl } from "./db/mode";

// Live operator console, part 1 (phase D23): restaurants, credit, top ups, invoices, refunds.
// Demo mode never imports this file.
//
// SECURITY:
// - Only a viewer whose role is 'operator' (from the server session) may call these.
// - The database functions in 0036 check the operator role again. The browser never sends a role.
// - Every write is rate limited per operator, counted in the database.
// - Reads never return guest names or phone numbers.

export type RestaurantsResult = { ok: true; message?: string } | { ok: false; message: string };

/** Read results always carry the data on success. */
export type ReadResult<T> = { ok: true; rows: T } | { ok: false; message: string };

const DATA_MODE_ERROR = "Live operator tools need live mode.";

/** Refusal codes this file can show. Only the exact code raised by a function counts. */
const REFUSAL_CODES = [
  "not_operator",
  "restaurant_not_found",
  "invoice_not_found",
  "not_pending",
  "not_open",
  "not_refundable",
  "amount_too_large",
  "credit_already_used",
  "bad_reference",
  "bad_reason",
  "bad_amount",
  "bad_slug",
  "bad_name",
  "bad_email",
  "bad_location",
  "slug_taken",
  "slug_reserved",
  "already_paid",
  "billing_paused",
] as const;

/** Map a database refusal code to plain words. Read the code from the cause chain, never the message. */
export function opsRefusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      const message = current.message.trim();
      if ((REFUSAL_CODES as readonly string[]).includes(message)) return message;
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return null;
}

export const RESTAURANT_MESSAGES: Record<string, string> = {
  not_operator: "Only Patron staff can do this.",
  restaurant_not_found: "That restaurant was not found.",
  invoice_not_found: "That invoice was not found.",
  not_pending: "That top up is no longer waiting. Nothing changed.",
  not_open: "Only an open invoice can be voided. Nothing changed.",
  already_paid: "That invoice is already paid or cancelled. Nothing changed.",
  not_refundable: "Only a confirmed payment can be refunded.",
  amount_too_large: "That refund is more than the amount left to refund.",
  credit_already_used: "That restaurant has already used this credit. Nothing changed.",
  bad_reference: "That payment was not found.",
  bad_reason: "Write a short reason (3 to 300 characters).",
  bad_amount: "Enter an amount in rands above zero (up to R100 000).",
  bad_slug: "The web address may use lowercase letters, numbers and single dashes.",
  bad_name: "Enter a name between 2 and 80 characters.",
  bad_email: "Enter a valid owner email.",
  bad_location: "The suburb or city is too long.",
  slug_taken: "That web address is already in use.",
  slug_reserved: "That web address is reserved. Try another.",
};

export function restaurantMessageForRefusal(code: string | null): string {
  if (code && RESTAURANT_MESSAGES[code]) return RESTAURANT_MESSAGES[code]!;
  return "Something went wrong. Nothing changed. Try again.";
}

const WRITE_LIMIT_PER_HOUR = 60;
const TOO_MANY = "That is a lot of changes in a short time. Please wait a little and try again.";

/** At most WRITE_LIMIT_PER_HOUR writes per operator per hour, counted in the database. */
async function withinWriteLimit(operatorId: string): Promise<boolean> {
  return withContext({ databaseUrl: requireDatabaseUrl(), isOperator: false }, async (transaction) => {
    const used = await transaction.execute<{ n: number }>(sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = 'ops-write' and key = ${operatorId} and created_at > now() - interval '1 hour'
    `);
    if (Number(used.rows[0]?.n ?? 0) >= WRITE_LIMIT_PER_HOUR) return false;
    await transaction.execute(sql`insert into rate_limit_hit (bucket, key) values ('ops-write', ${operatorId})`);
    return true;
  });
}

type Failure = { ok: false; message: string };

function requireOperator(viewer: Viewer | null): Failure | null {
  if (!viewer || viewer.role !== "operator") return { ok: false, message: restaurantMessageForRefusal("not_operator") };
  if (getDataMode() !== "live") return { ok: false, message: DATA_MODE_ERROR };
  return null;
}

/** Run one database function as an operator and map any refusal to plain words. */
async function runAsOperator<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T | Failure> {
  try {
    return await withContext({ databaseUrl: requireDatabaseUrl(), isOperator: true }, work);
  } catch (error) {
    return { ok: false, message: restaurantMessageForRefusal(opsRefusalCode(error)) };
  }
}

/** Gate for writes: operator check, then the rate limit. Returns a failure to stop, or null to go on. */
async function guardWrite(viewer: Viewer | null): Promise<Failure | null> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  if (!(await withinWriteLimit(viewer!.userId))) return { ok: false, message: TOO_MANY };
  return null;
}

type Row = Record<string, unknown>;
export type RestaurantListRow = {
  id: string; name: string; slug: string; status: string; plan: string; suburb: string;
  created_at: string; members: number; last_stamp_at: string | null; credit_cents: number;
  owner_email: string | null; active_locations: number;
};
export type PendingTopupRow = {
  payment_id: string; restaurant_id: string; restaurant_name: string; amount_cents: number;
  reference: string | null; created_at: string;
};
/** The restaurant detail JSON from operator_restaurant_detail. Holds no guest names or phone numbers. */
export type RestaurantDetail = {
  restaurant: { id: string; name: string; slug: string; status: string; plan: string; suburb: string; created_at: string };
  people: Array<{ email: string; role: string }>;
  counts: { members: number; stamps_30_days: number; active_locations: number };
  credit_cents: number;
  ledger: Array<{ entry_type: string; amount_cents: number; note: string | null; reference: string | null; created_at: string }>;
  audit: Array<{ action: string; actor_type: string; created_at: string }>;
  invoices: Array<{ id: string; amount_cents: number; description: string; due_date: string; status: string; created_at: string }>;
  payments: Array<{ id: string; kind: string; amount_cents: number; status: string; reference: string | null; refunded_cents: number; created_at: string }>;
  pending_topups: Array<{ id: string; amount_cents: number; reference: string | null; created_at: string }>;
  /** The monthly plan, or null when the restaurant has none. */
  subscription: {
    state: "active" | "past_due" | "cancelled";
    amount_cents: number;
    next_due_at: string | null;
    grace_ends_at: string | null;
  } | null;
};

export type InvoiceRow = {
  invoice_id: string; restaurant_id: string; restaurant_name: string; amount_cents: number;
  description: string | null; due_date: string | null; status: string; paid_at: string | null; created_at: string;
};
const rowsOf = <T>(res: unknown): T[] => ((res as { rows?: T[] }).rows ?? []);

/** The restaurant list for the operator. Search is matched in the database. */
export async function listRestaurantsLive(
  viewer: Viewer,
  input: { search: string; status: string; limit: number; offset: number },
): Promise<ReadResult<RestaurantListRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select * from operator_list_restaurants(${viewer.userId}, ${input.search}, ${input.status}, ${input.limit}, ${input.offset})`,
    );
    return { ok: true as const, rows: rowsOf<RestaurantListRow>(res) };
  })) as ReadResult<RestaurantListRow[]>;
}

/** One restaurant's detail as JSON from the database. Holds no guest names or phone numbers. */
export async function restaurantDetailLive(viewer: Viewer, restaurantId: string): Promise<{ ok: true; detail: RestaurantDetail } | { ok: false; message: string }> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select operator_restaurant_detail(${viewer.userId}, ${restaurantId}::uuid) as detail`);
    return { ok: true as const, detail: (rowsOf<{ detail: RestaurantDetail }>(res)[0]?.detail ?? {}) as RestaurantDetail };
  })) as { ok: true; detail: RestaurantDetail } | { ok: false; message: string };
}

/** Top ups waiting for a manual EFT check, across all restaurants. */
export async function pendingTopupsLive(viewer: Viewer): Promise<ReadResult<PendingTopupRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select * from operator_pending_topups(${viewer.userId})`);
    return { ok: true as const, rows: rowsOf<PendingTopupRow>(res) };
  })) as ReadResult<PendingTopupRow[]>;
}

/** Invoices across all restaurants, optionally filtered by status. */
export async function listInvoicesLive(
  viewer: Viewer,
  input: { status: string; limit: number },
): Promise<ReadResult<InvoiceRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select * from operator_list_invoices(${viewer.userId}, ${input.status}, ${input.limit})`);
    return { ok: true as const, rows: rowsOf<InvoiceRow>(res) };
  })) as ReadResult<InvoiceRow[]>;
}

/** Confirm a manual EFT top up. Credit is added once. */
export async function confirmTopupLive(viewer: Viewer, paymentId: string): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_confirm_topup(${viewer.userId}, ${paymentId}::uuid)`);
    return { ok: true as const, message: "Top up confirmed and credit added." };
  });
  return result as RestaurantsResult;
}

/** Reject a manual EFT top up. No credit is added. */
export async function rejectTopupLive(viewer: Viewer, paymentId: string, reason: string): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_reject_topup(${viewer.userId}, ${paymentId}::uuid, ${reason})`);
    return { ok: true as const, message: "Top up rejected. No credit was added." };
  });
  return result as RestaurantsResult;
}

/** Mark an open invoice paid, with the bank or card reference the money came in on. */
export async function markInvoicePaidLive(viewer: Viewer, invoiceId: string, reference: string, reason: string): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_mark_invoice_paid(${viewer.userId}, ${invoiceId}::uuid, ${reference}, ${reason})`);
    return { ok: true as const, message: "Invoice marked paid." };
  });
  return result as RestaurantsResult;
}

/** Void an open invoice. */
export async function voidInvoiceLive(viewer: Viewer, invoiceId: string, reason: string): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_void_invoice(${viewer.userId}, ${invoiceId}::uuid, ${reason})`);
    return { ok: true as const, message: "Invoice voided." };
  });
  return result as RestaurantsResult;
}

/** Record a refund already paid back by hand. `amountCents` is positive. */
export async function recordRefundLive(
  viewer: Viewer,
  input: { paymentId: string; amountCents: number; reason: string },
): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(
      sql`select operator_record_refund(${viewer.userId}, ${input.paymentId}::uuid, ${input.amountCents}, ${input.reason})`,
    );
    return { ok: true as const, message: "Refund recorded." };
  });
  return result as RestaurantsResult;
}

/** Set a monthly plan to active, past due or cancelled, with a note. Operator only, rate limited. */
export async function setSubscriptionStateLive(
  viewer: Viewer,
  input: { restaurantId: string; state: "active" | "past_due" | "cancelled"; note: string },
): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(
      sql`select operator_set_subscription_state(${viewer.userId}, ${input.restaurantId}::uuid, ${input.state}, ${input.note})`,
    );
    return { ok: true as const, message: "Monthly plan updated." };
  });
  return result as RestaurantsResult;
}

/** Create an open invoice for a restaurant. Operator only, rate limited, refusals in plain words. */
export async function createInvoiceLive(
  viewer: Viewer,
  input: { restaurantId: string; amountCents: number; description: string; dueDate: string },
): Promise<RestaurantsResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(
      sql`select operator_create_invoice(${viewer.userId}, ${input.restaurantId}::uuid, ${input.amountCents}::int, ${input.description}, ${input.dueDate}::date)`,
    );
    return { ok: true as const, message: "Invoice created." };
  });
  return result as RestaurantsResult;
}
