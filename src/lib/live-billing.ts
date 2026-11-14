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

/** True when the top-up amount (in rands typed by the owner) is inside the allowed range. */
export function isValidTopupRands(rands: number): boolean {
  return Number.isFinite(rands) && rands >= 100 && rands <= 100000;
}

/** Converts a rand amount typed by the owner to whole cents, or null when it is not a valid amount. */
export function randsToCentsOrNull(rands: number): number | null {
  if (!isValidTopupRands(rands)) return null;
  return Math.round(rands * 100);
}
