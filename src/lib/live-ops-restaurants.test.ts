import { describe, expect, it } from "vitest";
import {
  formatRandFromCents,
  isLowCredit,
  isRefundablePayment,
  monthlyCentsForPlan,
  planLabel,
  refundWording,
  statusLabel,
  subscriptionStateLabel,
  validateInvoiceInput,
  validateRefundInput,
} from "./live-ops-restaurants";

describe("formatRandFromCents", () => {
  it("shows whole rands with a space as the thousands separator and no cents", () => {
    expect(formatRandFromCents(0)).toBe("R0");
    expect(formatRandFromCents(12500)).toBe("R125");
    expect(formatRandFromCents(125000)).toBe("R1 250");
    expect(formatRandFromCents(10000000)).toBe("R100 000");
  });

  it("shows a minus sign for negative amounts", () => {
    expect(formatRandFromCents(-25000)).toBe("-R250");
  });
});

describe("labels", () => {
  it("gives plain words for statuses and plans", () => {
    expect(statusLabel("active")).toBe("Live");
    expect(statusLabel("paused")).toBe("Paused");
    expect(statusLabel("weird")).toBe("weird");
    // The names an owner sees on their billing page, not the older database tier names.
    expect(planLabel("starter")).toBe("Starter");
    expect(planLabel("managed")).toBe("Growth");
    expect(planLabel("partner")).toBe("Pro");
    expect(planLabel("custom")).toBe("Custom");
    expect(planLabel("weird")).toBe("weird");
  });

  it("gives the monthly card price of a plan, and nothing for a plan that is invoiced", () => {
    expect(monthlyCentsForPlan("starter")).toBe(39900);
    expect(monthlyCentsForPlan("managed")).toBe(120000);
    expect(monthlyCentsForPlan("partner")).toBeNull();
    expect(monthlyCentsForPlan("custom")).toBeNull();
    expect(monthlyCentsForPlan("weird")).toBeNull();
  });

  it("says which payments can have a refund recorded", () => {
    // A card payment settles as paid and a checked EFT top up as confirmed. Both were received.
    expect(isRefundablePayment("topup", "paid")).toBe(true);
    expect(isRefundablePayment("topup", "confirmed")).toBe(true);
    expect(isRefundablePayment("subscription", "paid")).toBe(true);
    expect(isRefundablePayment("topup", "pending")).toBe(false);
    expect(isRefundablePayment("topup", "failed")).toBe(false);
    expect(isRefundablePayment("topup", "rejected")).toBe(false);
    expect(isRefundablePayment("setup", "paid")).toBe(false);
  });

  it("describes the state of a monthly plan in plain words", () => {
    expect(subscriptionStateLabel("active")).toBe("Active");
    expect(subscriptionStateLabel("past_due")).toBe("Payment missed, in the 7 day grace period");
    expect(subscriptionStateLabel("cancelled")).toBe("Cancelled");
    expect(subscriptionStateLabel("weird")).toBe("weird");
  });

  it("describes refunds in plain words", () => {
    expect(refundWording(0, 50000)).toBe("No refunds recorded");
    expect(refundWording(20000, 50000)).toBe("R200 refunded so far");
    expect(refundWording(50000, 50000)).toBe("Fully refunded (R500)");
  });
});

describe("validateRefundInput", () => {
  it("accepts an amount within the remaining balance and trims the reason", () => {
    expect(validateRefundInput(10000, 50000, "  Card was charged twice  ")).toEqual({
      ok: true,
      amountCents: 10000,
      reason: "Card was charged twice",
    });
  });

  it("refuses zero, negative and fractional amounts", () => {
    expect(validateRefundInput(0, 50000, "Reason").ok).toBe(false);
    expect(validateRefundInput(-100, 50000, "Reason").ok).toBe(false);
    expect(validateRefundInput(100.5, 50000, "Reason").ok).toBe(false);
  });

  it("refuses an amount above what is left to refund", () => {
    const check = validateRefundInput(60000, 50000, "Reason");
    expect(check).toEqual({ ok: false, message: "That is more than the amount left to refund (R500)." });
  });

  it("refuses a short or long reason", () => {
    expect(validateRefundInput(100, 50000, "ab").ok).toBe(false);
    expect(validateRefundInput(100, 50000, "x".repeat(301)).ok).toBe(false);
    expect(validateRefundInput(100, 50000, "   ").ok).toBe(false);
  });
});

describe("validateInvoiceInput", () => {
  it("converts rands to cents", () => {
    expect(validateInvoiceInput(1250, "Setup help", "2026-12-01")).toEqual({
      ok: true,
      amountCents: 125000,
      description: "Setup help",
      dueDate: "2026-12-01",
    });
  });

  it("refuses an empty or huge amount, a short description and a bad date", () => {
    expect(validateInvoiceInput(0, "Setup help", "2026-12-01").ok).toBe(false);
    expect(validateInvoiceInput(100001, "Setup help", "2026-12-01").ok).toBe(false);
    expect(validateInvoiceInput(100, "ab", "2026-12-01").ok).toBe(false);
    expect(validateInvoiceInput(100, "Setup help", "01/12/2026").ok).toBe(false);
    expect(validateInvoiceInput(100, "Setup help", "2026-13-40").ok).toBe(false);
  });
});

describe("isLowCredit", () => {
  it("flags balances under R100", () => {
    expect(isLowCredit(9999)).toBe(true);
    expect(isLowCredit(10000)).toBe(false);
  });
});
