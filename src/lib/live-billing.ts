// Pure helpers for the "Plan and billing" screen (D21). No database, no network.

/** Plain words for a payment status. */
export function paymentStatusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Waiting for payment";
    case "failed":
      return "Did not go through";
    case "cancelled":
      return "Cancelled";
    case "confirmed":
      return "Paid";
    case "rejected":
      return "Not accepted";
    default:
      return status;
  }
}

/** Plain words for an invoice status. */
export function invoiceStatusLabel(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "void") return "Cancelled";
  return "Waiting for payment";
}

/** The statement shown on the screen. Plain words, no jargon. */
export const FAILED_PAYMENT_RULES =
  "If a monthly payment does not go through, we give you 7 days to fix it. After that, your campaigns pause. Your till and loyalty card keep working the whole time.";

/** The monthly payment state the screen needs. Mirrors the rule in billing_paused (migration 0038). */
export type SubscriptionView = {
  state: "active" | "past_due" | "cancelled";
  graceEndsAt: string | null;
  nextDueAt: string | null;
};

/**
 * True when campaign sending is paused: a monthly payment is past its 7 day grace, or a
 * cancelled monthly plan is past its due date, or an invoice is more than 7 days overdue.
 */
export function isBillingPaused(
  subscription: SubscriptionView | null,
  overdueInvoiceDueDates: string[],
  now: Date = new Date(),
): boolean {
  if (subscription?.state === "past_due" && subscription.graceEndsAt) {
    if (new Date(subscription.graceEndsAt).getTime() < now.getTime()) return true;
  }
  if (subscription?.state === "cancelled" && subscription.nextDueAt) {
    if (new Date(subscription.nextDueAt).getTime() < now.getTime()) return true;
  }
  // The database counts whole days: an invoice due on the 1st is paused from the 9th, the 8th day
  // after its due date (billing_paused, migration 0038). The same rule here keeps the banner and
  // the sending block from disagreeing for a day.
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return overdueInvoiceDueDates.some((due) => Date.parse(due.slice(0, 10)) + sevenDays < startOfToday);
}

export type BillingBannerKind = "none" | "grace" | "paused";

/** Which banner every owner screen shows. Paused wins over grace. Nothing shows when all is well. */
export function billingBannerKind(subscription: SubscriptionView | null, paused: boolean): BillingBannerKind {
  if (paused) return "paused";
  if (subscription?.state === "past_due") return "grace";
  return "none";
}

/** A date in plain words for owners, South African English, e.g. "19 November". */
export function plainDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
  });
}

/** The one-line state of the monthly card payment, in plain words for the owner. */
export function monthlyPaymentLine(subscription: SubscriptionView | null, paused: boolean): string {
  if (!subscription) return "No monthly card payment is set up.";
  if (subscription.state === "cancelled") {
    return subscription.nextDueAt
      ? `Your monthly plan was cancelled. Campaigns pause on ${plainDate(subscription.nextDueAt)}.`
      : "Your monthly plan was cancelled.";
  }
  if (subscription.state === "past_due") {
    if (paused) {
      return "Your campaigns are paused because a monthly payment did not go through. Your till and loyalty card keep working.";
    }
    const by = subscription.graceEndsAt ? ` by ${plainDate(subscription.graceEndsAt)}` : "";
    return `Your last payment did not go through. Please fix it${by} or your campaigns will pause. PayFast tries again on its own. If your card changed, update it on PayFast or ask Patron.`;
  }
  return subscription.nextDueAt
    ? `Active. Next payment due ${plainDate(subscription.nextDueAt)}.`
    : "Active.";
}

/** True when the top-up amount (in rands typed by the owner) is inside the allowed range. */
export function isValidTopupRands(rands: number): boolean {
  return Number.isFinite(rands) && rands >= 100 && rands <= 100000;
}

/** Converts a rand amount typed by the owner to whole cents, or null when it is not a valid amount. */
export function randsToCentsOrNull(rands: number): number | null {
  if (!isValidTopupRands(rands)) return null;
  return Math.round(rands * 100);
}
