import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode } from "./db/mode";
import { randomBytes } from "node:crypto";

// Live credit (phase D15). Demo mode never imports this file.
//
// SECURITY:
// - The restaurant comes from the server session. Owner or manager only.
// - A top-up is only a pending request. No money moves here; the operator confirms the EFT.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

export type CreditLedgerEntry = {
  id: string;
  entryType: string;
  amountCents: number;
  reference: string;
  note: string | null;
  createdAt: string;
};

export type CreditPayment = {
  id: string;
  amountCents: number;
  status: string;
  reference: string;
  createdAt: string;
};

export type LiveCredit = {
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
  entries: CreditLedgerEntry[];
  payments: CreditPayment[];
};

const iso = (value: Date | string) => new Date(value).toISOString();

/** Balance, the amount set aside for campaigns not yet sent, and the ledger. */
export async function getLiveCredit(viewer: Viewer): Promise<LiveCredit | null> {
  if (getDataMode() !== "live" || !canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const totals = await transaction.execute<{ balance: number; reserved: number }>(sql`
        select
          coalesce(sum(amount_cents), 0)::int as balance,
          coalesce(-sum(amount_cents) filter (where entry_type = 'reserve'), 0)::int
            + coalesce(sum(amount_cents) filter (where entry_type = 'release'), 0)::int as reserved
        from credit_ledger
        where restaurant_id = ${viewer.restaurantId}
      `);
      const entries = await transaction.execute<{
        id: string;
        entry_type: string;
        amount_cents: number;
        reference: string;
        note: string | null;
        created_at: Date | string;
      }>(sql`
        select id, entry_type::text as entry_type, amount_cents, reference, note, created_at
        from credit_ledger
        where restaurant_id = ${viewer.restaurantId}
        order by created_at desc
        limit 100
      `);
      const payments = await transaction.execute<{
        id: string;
        amount_cents: number;
        status: string;
        reference: string;
        created_at: Date | string;
      }>(sql`
        select id, amount_cents, status::text as status, reference, created_at
        from payment
        where restaurant_id = ${viewer.restaurantId}
          and kind = 'topup'
        order by created_at desc
        limit 50
      `);
      const balance = Number(totals.rows[0]?.balance ?? 0);
      const reserved = Math.max(0, Number(totals.rows[0]?.reserved ?? 0));
      return {
        balanceCents: balance,
        reservedCents: reserved,
        availableCents: balance - reserved,
        entries: entries.rows.map((row) => ({
          id: row.id,
          entryType: row.entry_type,
          amountCents: row.amount_cents,
          reference: row.reference,
          note: row.note,
          createdAt: iso(row.created_at),
        })),
        payments: payments.rows.map((row) => ({
          id: row.id,
          amountCents: row.amount_cents,
          status: row.status,
          reference: row.reference,
          createdAt: iso(row.created_at),
        })),
      };
    },
  );
}

export type TopupOutcome = { ok: true; reference: string } | { ok: false; message: string };

/** Record a top-up request for the operator to match against an EFT. */
export async function requestLiveTopup(viewer: Viewer, amountCents: number): Promise<TopupOutcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only the owner or a manager can request a top-up." };
  }
  if (!Number.isInteger(amountCents) || amountCents < 1000 || amountCents > 1_000_000) {
    return { ok: false, message: "Enter an amount between R10 and R10,000." };
  }
  // Short random suffix so the reference is unique per request.
  const reference = `PAT-${randomBytes(3).toString("hex").toUpperCase()}`;
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          select request_topup(
            ${viewer.restaurantId}::uuid,
            ${viewer.userId}::text,
            ${amountCents}::integer,
            ${reference}::text
          )
        `);
      },
    );
    return { ok: true, reference };
  } catch {
    return { ok: false, message: "The top-up request was not saved. Try again." };
  }
}
