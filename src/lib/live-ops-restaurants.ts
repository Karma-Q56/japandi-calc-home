// Pure helpers for the live operator restaurant, credit, top up, invoice and refund screens (D23).
// Browser-safe: no database or server imports.
import { planBilling } from "@/config/plans";

/** Rand amount for display. Never shows cents: R1 250 with a space as thousands separator. */
export function formatRandFromCents(cents: number): string {
  const rands = Math.round(cents / 100);
  const sign = rands < 0 ? "-" : "";
  const digits = String(Math.abs(rands)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}R${digits}`;
}

/** Plain words for a restaurant status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Live";
    case "paused":
      return "Paused";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

/**
 * Plain words for a plan, the same names an owner sees on their billing page. The database keeps
 * the older tier names: starter is Starter, managed is Growth, partner is Pro.
 */
export function planLabel(plan: string): string {
  switch (plan) {
    case "starter":
      return "Starter";
    case "managed":
      return "Growth";
    case "partner":
      return "Pro";
    case "custom":
      return "Custom";
    default:
      return plan;
  }
}

/** The monthly card price in cents for a plan tier, or null when the plan is invoiced (Pro, custom). */
export function monthlyCentsForPlan(plan: string): number | null {
  const found = Object.values(planBilling).find((item) => item.tier === plan);
  return found?.monthlyCents ?? null;
}

/**
 * True when a payment can have a refund recorded: money was actually received (a card payment is
 * "paid", a checked EFT top up is "confirmed") and it was a top up or a monthly plan payment.
 */
export function isRefundablePayment(kind: string, status: string): boolean {
  return (kind === "topup" || kind === "subscription") && (status === "paid" || status === "confirmed");
}

/** Plain words for a ledger row type. */
export function ledgerTypeLabel(type: string): string {
  switch (type) {
    case "topup":
      return "Top up";
    case "reserve":
      return "Held for messages";
    case "release":
      return "Hold released";
    case "charge":
      return "Messages sent";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
    default:
      return type;
  }
}

/** Plain words for a payment kind. */
export function paymentKindLabel(kind: string): string {
  switch (kind) {
    case "setup":
      return "Set up fee";
    case "subscription":
      return "Monthly plan";
    case "topup":
      return "Credit top up";
    default:
      return kind;
  }
}

/** Plain words for a refund sentence on the payments list. */
export function refundWording(refundedCents: number, paidCents: number): string {
  if (refundedCents <= 0) return "No refunds recorded";
  if (refundedCents >= paidCents) return `Fully refunded (${formatRandFromCents(refundedCents)})`;
  return `${formatRandFromCents(refundedCents)} refunded so far`;
}

export type RefundCheck = { ok: true; amountCents: number; reason: string } | { ok: false; message: string };

/**
 * Check a refund before it is sent. `remainingCents` is the part of the payment not yet refunded.
 * Amount is in cents, already converted from rand. The database checks again.
 */
export function validateRefundInput(amountCents: number, remainingCents: number, reason: string): RefundCheck {
  const trimmed = reason.trim();
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, message: "Enter an amount in rands above zero." };
  }
  if (amountCents > remainingCents) {
    return { ok: false, message: `That is more than the amount left to refund (${formatRandFromCents(remainingCents)}).` };
  }
  if (trimmed.length < 3 || trimmed.length > 300) {
    return { ok: false, message: "Write a short reason (3 to 300 characters)." };
  }
  return { ok: true, amountCents, reason: trimmed };
}

export type InvoiceCheck =
  | { ok: true; amountCents: number; description: string; dueDate: string }
  | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Check a new invoice. The amount is entered in rand and converted to cents here. */
export function validateInvoiceInput(amountRands: number, description: string, dueDate: string): InvoiceCheck {
  const text = description.trim();
  if (!Number.isFinite(amountRands) || amountRands <= 0 || amountRands > 100000) {
    return { ok: false, message: "Enter an amount in rands above zero (up to R100 000)." };
  }
  if (text.length < 3 || text.length > 200) {
    return { ok: false, message: "Describe the invoice in 3 to 200 characters." };
  }
  if (!ISO_DATE.test(dueDate) || Number.isNaN(Date.parse(dueDate))) {
    return { ok: false, message: "Pick a due date." };
  }
  return { ok: true, amountCents: Math.round(amountRands * 100), description: text, dueDate };
}

/** Customer words for a top up or invoice status. */
export function invoiceStatusText(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "void") return "Cancelled";
  if (status === "open") return "Waiting for payment";
  return status;
}

/** True when a balance is low enough to show on the credit screen. */
export const LOW_CREDIT_CENTS = 10000;
export function isLowCredit(balanceCents: number): boolean {
  return balanceCents < LOW_CREDIT_CENTS;
}

/** Plain words for the state of a monthly card plan. */
export function subscriptionStateLabel(state: string): string {
  if (state === "active") return "Active";
  if (state === "past_due") return "Payment missed, in the 7 day grace period";
  if (state === "cancelled") return "Cancelled";
  return state;
}

/** The page address rule, as the database applies it: lowercase letters and numbers with single dashes, 3 to 40 characters. */
export const PAGE_ADDRESS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CHANGE_ADDRESS_WARNING =
  "Old links and printed QR codes keep working. The old address will always point to the new one.";

/** Check a page address change before it is sent. The database checks again. */
export function checkAddressChange(
  currentSlug: string,
  input: string,
  reason: string,
): { ok: true; slug: string; reason: string } | { ok: false; message: string } {
  const slug = input.trim().toLowerCase();
  const why = reason.trim();
  if (slug.length < 3 || slug.length > 40 || !PAGE_ADDRESS_PATTERN.test(slug)) {
    return { ok: false, message: "Use 3 to 40 lowercase letters or numbers, with single dashes between words." };
  }
  if (slug === currentSlug) return { ok: false, message: "That is already this restaurant's page address." };
  if (why.length < 3 || why.length > 300) return { ok: false, message: "Write a short reason (3 to 300 characters)." };
  return { ok: true, slug, reason: why };
}
