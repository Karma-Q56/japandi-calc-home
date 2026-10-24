import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  adjustCredit,
  balanceFor,
  confirmTopup,
  entrySignError,
  planEntries,
  requestTopup,
} from "@/domain/credit";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT = "rest-daily-grind";

/**
 * Ledger contract shared with db/credit_ledger (M9 reuses this table against
 * the SQL CHECK constraint). Each row: entry type, amount sign, accepted?
 */
export const CREDIT_CONTRACT = [
  { name: "topup adds credit", type: "topup", amountCents: 5000, accepted: true },
  { name: "topup refuses zero or negative", type: "topup", amountCents: -100, accepted: false },
  { name: "reserve takes credit", type: "reserve", amountCents: -1200, accepted: true },
  { name: "reserve refuses positive", type: "reserve", amountCents: 1200, accepted: false },
  { name: "release gives back", type: "release", amountCents: 1200, accepted: true },
  { name: "charge takes credit", type: "charge", amountCents: -800, accepted: true },
  { name: "refund gives back", type: "refund", amountCents: 35, accepted: true },
  { name: "adjustment either way but never zero", type: "adjustment", amountCents: 250, accepted: true },
  { name: "adjustment refuses zero", type: "adjustment", amountCents: 0, accepted: false },
] as const;

describe("credit ledger contract", () => {
  for (const row of CREDIT_CONTRACT) {
    it(`${row.name}`, () => {
      const error = entrySignError(row.type, row.amountCents);
      expect(error === null).toBe(row.accepted);
    });
  }

  it("seed balance equals the sum of the ledger", () => {
    const state = demoRepo.read();
    expect(balanceFor(state, RESTAURANT)).toBe(4200);
    expect(balanceFor(state, RESTAURANT)).toBe(
      state.ledger.filter((entry) => entry.restaurantId === RESTAURANT).reduce((sum, entry) => sum + entry.amountCents, 0),
    );
  });
});

describe("top-ups", () => {
  it("requests carry a unique PAT-{slug}-{4 digits} reference", () => {
    const first = requestTopup({ restaurantId: RESTAURANT, amountCents: 10000, requestedBy: "owner-1" });
    const second = requestTopup({ restaurantId: RESTAURANT, amountCents: 10000, requestedBy: "owner-1" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.reference).toMatch(/^PAT-DAILY-GRIND-\d{4}$/);
    expect(second.data.reference).toMatch(/^PAT-DAILY-GRIND-\d{4}$/);
    expect(first.data.reference).not.toBe(second.data.reference);
    expect(first.data.status).toBe("pending");
  });

  it("confirming twice writes exactly one ledger entry (reference topup:<payment_id>)", () => {
    const requested = requestTopup({ restaurantId: RESTAURANT, amountCents: 5000, requestedBy: "owner-1" });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const before = demoRepo.read().ledger.length;
    const first = confirmTopup({ paymentId: requested.data.id, confirmedBy: "operator-1" });
    const second = confirmTopup({ paymentId: requested.data.id, confirmedBy: "operator-1" });
    expect(first.ok && first.data.status).toBe("confirmed");
    expect(second.ok && second.data.status).toBe("confirmed");
    const topups = demoRepo
      .read()
      .ledger.filter((entry) => entry.reference === `topup:${requested.data.id}`);
    expect(topups).toHaveLength(1);
    expect(demoRepo.read().ledger.length).toBe(before + 1);
    expect(balanceFor(demoRepo.read(), RESTAURANT)).toBe(4200 + 5000);
  });

  it("adjustments need a written note", () => {
    const missing = adjustCredit({ restaurantId: RESTAURANT, amountCents: 100, note: "  ", actor: "operator-1" });
    expect(missing.ok).toBe(false);
    const ok = adjustCredit({ restaurantId: RESTAURANT, amountCents: -200, note: "Goodwill", actor: "operator-1" });
    expect(ok.ok).toBe(true);
    expect(balanceFor(demoRepo.read(), RESTAURANT)).toBe(4200 - 200);
  });
});

describe("never-negative balance", () => {
  it("a reserve bigger than the balance is refused", () => {
    const state = demoRepo.read();
    const planned = planEntries(state, RESTAURANT, [
      { type: "reserve", amountCents: -(balanceFor(state, RESTAURANT) + 1), reference: "reserve:x" },
    ]);
    expect(planned.ok).toBe(false);
  });

  it("concurrent reserve attempts never push the balance below zero", () => {
    const state = demoRepo.read();
    const balance = balanceFor(state, RESTAURANT);
    const each = -(Math.floor(balance / 2) + 100);
    const first = planEntries(state, RESTAURANT, [{ type: "reserve", amountCents: each, reference: "reserve:a" }]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Interleave: the second attempt sees the first reservation applied.
    const mid = {
      ...state,
      ledger: [...state.ledger, ...first.entries],
    };
    const second = planEntries(mid, RESTAURANT, [{ type: "reserve", amountCents: each, reference: "reserve:b" }]);
    expect(second.ok).toBe(false);
    expect(balanceFor(mid, RESTAURANT)).toBeGreaterThanOrEqual(0);
  });

  it("duplicate references are refused", () => {
    const state = demoRepo.read();
    const planned = planEntries(state, RESTAURANT, [
      { type: "topup", amountCents: 100, reference: "demo-topup-1" },
    ]);
    expect(planned.ok).toBe(false);
  });
});
