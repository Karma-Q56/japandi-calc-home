import { describe, expect, it } from "vitest";
import {
  budgetLine,
  doubleDayLine,
  validateTiers,
  validateTools,
  type LiveToolsInput,
} from "./live-tools";

const base: LiveToolsInput = {
  doubleStampEnabled: false,
  doubleStampWeekday: 2,
  streakEnabled: false,
  streakWeeks: 4,
  streakWeeklyVisits: 1,
  streakBonusStamps: 1,
  toolStampBudget: 0,
  birthdayReward: false,
  birthdayRewardKind: "stamp",
  birthdayRewardItem: "",
  mysteryEveryVisits: 0,
};

describe("validateTools", () => {
  it("accepts the defaults", () => {
    expect(validateTools(base).ok).toBe(true);
  });

  it("keeps the streak limits the same as the demo", () => {
    expect(validateTools({ ...base, streakWeeks: 1 }).ok).toBe(false);
    expect(validateTools({ ...base, streakWeeks: 12 }).ok).toBe(true);
    expect(validateTools({ ...base, streakWeeks: 13 }).ok).toBe(false);
    expect(validateTools({ ...base, streakWeeklyVisits: 8 }).ok).toBe(false);
    expect(validateTools({ ...base, streakBonusStamps: 6 }).ok).toBe(false);
  });

  it("needs a budget between 1 and 2000 once a bonus is switched on", () => {
    expect(validateTools({ ...base, doubleStampEnabled: true, toolStampBudget: 0 }).ok).toBe(false);
    expect(validateTools({ ...base, streakEnabled: true, toolStampBudget: 2001 }).ok).toBe(false);
    expect(validateTools({ ...base, streakEnabled: true, toolStampBudget: 50 }).ok).toBe(true);
  });

  it("allows a zero budget when no bonus is on (no limit)", () => {
    expect(validateTools({ ...base, toolStampBudget: 0 }).ok).toBe(true);
  });

  it("trims the birthday item and rejects one over 80 characters", () => {
    const ok = validateTools({ ...base, birthdayRewardItem: "  cake  " });
    expect(ok.ok && ok.value.birthdayRewardItem).toBe("cake");
    expect(validateTools({ ...base, birthdayRewardItem: "x".repeat(81) }).ok).toBe(false);
  });

  it("limits the mystery reward to 0 to 50 visits", () => {
    expect(validateTools({ ...base, mysteryEveryVisits: 50 }).ok).toBe(true);
    expect(validateTools({ ...base, mysteryEveryVisits: 51 }).ok).toBe(false);
  });
});

describe("validateTiers", () => {
  it("accepts the defaults 3 and 8", () => {
    expect(validateTiers({ regular: 3, vip: 8 }).ok).toBe(true);
  });

  it("requires VIP to need more visits than Regular", () => {
    expect(validateTiers({ regular: 8, vip: 8 }).ok).toBe(false);
    expect(validateTiers({ regular: 9, vip: 8 }).ok).toBe(false);
  });

  it("keeps each threshold in range", () => {
    expect(validateTiers({ regular: 0, vip: 8 }).ok).toBe(false);
    expect(validateTiers({ regular: 3, vip: 201 }).ok).toBe(false);
  });
});

describe("owner text", () => {
  it("says nothing when the double stamp day is off", () => {
    expect(doubleDayLine(false, "Wednesday")).toBeNull();
  });

  it("names the weekday when the double stamp day is on", () => {
    expect(doubleDayLine(true, "Wednesday")).toBe(
      "Double stamp day: every Wednesday. A visit that day earns one extra stamp.",
    );
  });

  it("explains the budget, with and without a cap", () => {
    expect(budgetLine(0, 0)).toBe("No monthly limit on bonus stamps.");
    expect(budgetLine(50, 12)).toBe("12 of 50 bonus stamps used this month, 38 left.");
    expect(budgetLine(10, 15)).toBe("15 of 10 bonus stamps used this month, 0 left.");
  });
});
