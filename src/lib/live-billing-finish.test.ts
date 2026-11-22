import { describe, expect, it } from "vitest";
import {
  billingBannerKind,
  isBillingPaused,
  monthlyPaymentLine,
  plainDate,
  type SubscriptionView,
} from "./live-billing";

const now = new Date("2026-11-17T10:00:00Z");
const pastDue = (graceEndsAt: string): SubscriptionView => ({
  state: "past_due",
  graceEndsAt,
  nextDueAt: null,
});

describe("isBillingPaused", () => {
  it("is false with no subscription and no overdue invoices", () => {
    expect(isBillingPaused(null, [], now)).toBe(false);
  });

  it("is false while a failed monthly payment is still inside grace", () => {
    expect(isBillingPaused(pastDue("2026-11-20T00:00:00Z"), [], now)).toBe(false);
  });

  it("is true once a failed monthly payment is past grace", () => {
    expect(isBillingPaused(pastDue("2026-11-16T00:00:00Z"), [], now)).toBe(true);
  });

  it("is true for a cancelled plan past its due date, and false before it", () => {
    const cancelled = (nextDueAt: string): SubscriptionView => ({ state: "cancelled", graceEndsAt: null, nextDueAt });
    expect(isBillingPaused(cancelled("2026-11-10T00:00:00Z"), [], now)).toBe(true);
    expect(isBillingPaused(cancelled("2026-11-30T00:00:00Z"), [], now)).toBe(false);
  });

  it("is true when an invoice is more than 7 days overdue, and false within 7 days", () => {
    expect(isBillingPaused(null, ["2026-11-01T00:00:00Z"], now)).toBe(true);
    expect(isBillingPaused(null, ["2026-11-12T00:00:00Z"], now)).toBe(false);
  });

  it("counts whole days like the database: exactly 7 days late is not paused, 8 days is", () => {
    // now is 17 November. Due 10 November is 7 days late; due 9 November is 8 days late.
    expect(isBillingPaused(null, ["2026-11-10"], now)).toBe(false);
    expect(isBillingPaused(null, ["2026-11-09"], now)).toBe(true);
    // The hour of the day does not change the answer.
    expect(isBillingPaused(null, ["2026-11-10"], new Date("2026-11-17T23:59:00Z"))).toBe(false);
    expect(isBillingPaused(null, ["2026-11-09"], new Date("2026-11-17T00:01:00Z"))).toBe(true);
  });
});

describe("billingBannerKind", () => {
  it("shows nothing when the plan is fine", () => {
    expect(billingBannerKind(null, false)).toBe("none");
    expect(billingBannerKind({ state: "active", graceEndsAt: null, nextDueAt: null }, false)).toBe("none");
  });

  it("shows grace while a monthly payment is failing", () => {
    expect(billingBannerKind(pastDue("2026-11-20T00:00:00Z"), false)).toBe("grace");
  });

  it("shows paused over grace when campaigns are paused", () => {
    expect(billingBannerKind(pastDue("2026-11-20T00:00:00Z"), true)).toBe("paused");
  });
});

describe("plainDate", () => {
  it("writes the day and month in words for South African readers", () => {
    expect(plainDate("2026-11-19T10:00:00Z")).toBe("19 November");
  });
});

describe("monthlyPaymentLine", () => {
  it("says no card payment is set up without a subscription", () => {
    expect(monthlyPaymentLine(null, false)).toBe("No monthly card payment is set up.");
  });

  it("names the grace date while a payment is failing", () => {
    expect(monthlyPaymentLine(pastDue("2026-11-19T10:00:00Z"), false)).toContain("by 19 November");
  });

  it("says campaigns are paused when billing is paused", () => {
    expect(monthlyPaymentLine(pastDue("2026-11-10T10:00:00Z"), true)).toContain("campaigns are paused");
  });

  it("shows the next due date for an active plan", () => {
    expect(
      monthlyPaymentLine({ state: "active", graceEndsAt: null, nextDueAt: "2026-12-01T10:00:00Z" }, false),
    ).toBe("Active. Next payment due 1 December.");
  });
});
