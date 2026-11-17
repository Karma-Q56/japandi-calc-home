import { describe, expect, it } from "vitest";
import {
  formatRandFromCents,
  isLowCredit,
  planLabel,
  refundWording,
  statusLabel,
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
    expect(planLabel("managed")).toBe("Managed");
    expect(planLabel("weird")).toBe("weird");
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
