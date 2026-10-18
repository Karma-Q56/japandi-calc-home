import { demoRepo, updateDemo } from "@/data/repo";
import type { DemoState, LedgerEntry, LedgerEntryType, Payment } from "@/data/types";
import { logAudit, type AuditAction } from "./audit";
import { failure, success } from "./demo";

/** Plain-English labels for the owner ledger table. */
export const LEDGER_LABELS: Record<LedgerEntryType, string> = {
  topup: "Top-up",
  reserve: "Reserved for campaign",
  release: "Reservation released",
  charge: "Messages sent",
  refund: "Refund",
  adjustment: "Manual adjustment",
};

export const CREDIT_ACTIONS = [
  "topup_request",
  "topup_confirm",
  "adjustment",
  "campaign_confirm",
  "campaign_settle",
  "campaign_cancel",
] as const;

/** Balance is always the sum of the ledger, in integer cents. */
export function balanceCents(entries: LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0);
}

export function balanceFor(state: DemoState, restaurantId: string): number {
  return balanceCents(state.ledger.filter((entry) => entry.restaurantId === restaurantId));
}

/** Mirror of the credit_ledger CHECK constraint in db/schema.sql (M9 reuses this). */
export function entrySignError(type: LedgerEntryType, amountCents: number): string | null {
  if (!Number.isInteger(amountCents)) return "Amounts are whole cents.";
  if (type === "topup" || type === "release" || type === "refund") {
    return amountCents > 0 ? null : `${LEDGER_LABELS[type]} must add credit.`;
  }
  if (type === "reserve" || type === "charge") {
    return amountCents < 0 ? null : `${LEDGER_LABELS[type]} must take credit.`;
  }
  return amountCents !== 0 ? null : "Adjustments cannot be zero.";
}

export interface NewEntry {
  type: LedgerEntryType;
  amountCents: number;
  reference: string;
  campaignId?: string;
  messageId?: string;
  paymentId?: string;
  note?: string;
  createdBy?: string;
}

/**
 * Pure core: validate a batch of entries (unique references, correct signs)
 * and refuse anything that would push the balance below zero. Returns the
 * entries to append, or the reason they were refused.
 */
export function planEntries(
  state: DemoState,
  restaurantId: string,
  batch: NewEntry[],
): { ok: true; entries: LedgerEntry[] } | { ok: false; reason: string } {
  const seen = new Set(state.ledger.map((entry) => entry.reference));
  const now = new Date(state.now).toISOString();
  const entries: LedgerEntry[] = [];
  for (const item of batch) {
    if (!item.reference.trim()) return { ok: false, reason: "Every entry needs a reference." };
    if (seen.has(item.reference)) return { ok: false, reason: "That reference was already used." };
    seen.add(item.reference);
    const signError = entrySignError(item.type, item.amountCents);
    if (signError) return { ok: false, reason: signError };
    entries.push({
      id: `ledger-${crypto.randomUUID()}`,
      restaurantId,
      type: item.type,
      amountCents: item.amountCents,
      reference: item.reference,
      ...(item.campaignId ? { campaignId: item.campaignId } : {}),
      ...(item.messageId ? { messageId: item.messageId } : {}),
      ...(item.paymentId ? { paymentId: item.paymentId } : {}),
      ...(item.note ? { note: item.note } : {}),
      ...(item.createdBy ? { createdBy: item.createdBy } : {}),
      createdAt: now,
    });
  }
  const after =
    balanceCents(state.ledger.filter((entry) => entry.restaurantId === restaurantId)) +
    balanceCents(entries);
  if (after < 0) return { ok: false, reason: "Insufficient credit for that action." };
  return { ok: true, entries };
}

/** Append validated entries and keep the cached restaurant balance in sync. */
function commitEntries(restaurantId: string, entries: LedgerEntry[]) {
  updateDemo((current) => {
    const ledger = [...current.ledger, ...entries];
    const balance = balanceCents(ledger.filter((entry) => entry.restaurantId === restaurantId));
    return {
      ...current,
      ledger,
      restaurants: current.restaurants.map((restaurant) =>
        restaurant.id === restaurantId ? { ...restaurant, creditCents: balance } : restaurant,
      ),
    };
  });
}

function audit(actor: string, action: AuditAction, restaurantId: string, object?: string) {
  if (object === undefined) logAudit({ actor, action, restaurantId });
  else logAudit({ actor, action, restaurantId, object });
}

/** PAT-{SLUG}-{4 digits}, unique per payment. Slug is upper-cased for readability. */
export function paymentReference(slug: string, taken: Set<string>): string {
  const stem = `PAT-${slug.toUpperCase()}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const reference = `${stem}-${digits}`;
    if (!taken.has(reference)) return reference;
  }
  return `${stem}-${Date.now().toString().slice(-4)}`;
}

export function requestTopup(input: {
  restaurantId: string;
  amountCents: number;
  requestedBy: string;
}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((r) => r.id === input.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return failure("INVALID", "Top-up amounts are whole cents above zero.");
  }
  const reference = paymentReference(
    restaurant.slug,
    new Set(state.payments.map((payment) => payment.reference)),
  );
  const now = new Date(state.now).toISOString();
  const payment: Payment = {
    id: `payment-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    kind: "topup",
    amountCents: input.amountCents,
    status: "pending",
    reference,
    provider: "manual_eft",
    requestedBy: input.requestedBy,
    createdAt: now,
  };
  updateDemo((current) => ({ ...current, payments: [...current.payments, payment] }));
  audit(input.requestedBy, "topup_request", input.restaurantId, payment.id);
  return success(payment);
}

/**
 * Confirm an EFT top-up. Idempotent: confirming twice writes exactly one
 * `topup:<payment_id>` ledger entry and returns the existing payment.
 */
export function confirmTopup(input: { paymentId: string; confirmedBy: string }) {
  const state = demoRepo.read();
  const payment = state.payments.find((item) => item.id === input.paymentId);
  if (!payment) return failure("NOT_FOUND", "Payment not found.");
  if (payment.status === "confirmed") return success(payment);
  if (payment.status !== "pending") {
    return failure("INVALID", "Only pending payments can be confirmed.");
  }
  const planned = planEntries(state, payment.restaurantId, [
    {
      type: "topup",
      amountCents: payment.amountCents,
      reference: `topup:${payment.id}`,
      paymentId: payment.id,
      createdBy: input.confirmedBy,
    },
  ]);
  if (!planned.ok) return failure("INVALID", planned.reason);
  const now = new Date(state.now).toISOString();
  commitEntries(payment.restaurantId, planned.entries);
  updateDemo((current) => ({
    ...current,
    payments: current.payments.map((item) =>
      item.id === payment.id
        ? { ...item, status: "confirmed" as const, confirmedBy: input.confirmedBy, confirmedAt: now }
        : item,
    ),
  }));
  audit(input.confirmedBy, "topup_confirm", payment.restaurantId, payment.id);
  return success({ ...payment, status: "confirmed" as const });
}

export function adjustCredit(input: {
  restaurantId: string;
  amountCents: number;
  note: string;
  actor: string;
}) {
  const state = demoRepo.read();
  if (!state.restaurants.some((r) => r.id === input.restaurantId)) {
    return failure("NOT_FOUND", "Restaurant not found.");
  }
  if (!input.note.trim()) return failure("INVALID", "Adjustments need a written note.");
  const planned = planEntries(state, input.restaurantId, [
    {
      type: "adjustment",
      amountCents: input.amountCents,
      reference: `adjustment:${crypto.randomUUID()}`,
      note: input.note.trim(),
      createdBy: input.actor,
    },
  ]);
  if (!planned.ok) return failure("INVALID", planned.reason);
  commitEntries(input.restaurantId, planned.entries);
  audit(input.actor, "adjustment", input.restaurantId, planned.entries[0]!.id);
  return success(planned.entries[0]!);
}

export function listLedger(restaurantId: string) {
  const state = demoRepo.read();
  return success({
    balanceCents: balanceFor(state, restaurantId),
    entries: state.ledger
      .filter((entry) => entry.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    payments: state.payments
      .filter((payment) => payment.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}
