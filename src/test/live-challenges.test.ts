import { describe, expect, it } from "vitest";
import { challengeRuleLine, rewardLine, validateChallenge, validateReferrals, type LiveChallengeInput } from "@/lib/live-challenges";

const base: LiveChallengeInput = {
  title: "Coffee club",
  kind: "visits",
  visits: 3,
  windowDays: 14,
  weekdays: [],
  startHour: null,
  endHour: null,
  rewardType: "stamps",
  bonusStamps: 2,
  rewardItem: "",
  percentOff: null,
  amountOffCents: null,
  validDays: null,
  active: true,
  menuItemId: null,
  menuSectionId: null,
  targetName: "",
};

describe("try this dish", () => {
  const dish: LiveChallengeInput = {
    ...base,
    kind: "try_item",
    visits: 2,
    windowDays: 30,
    menuItemId: "11111111-1111-4111-8111-111111111111",
    menuSectionId: null,
    targetName: "Peri-peri chicken",
    rewardType: "amount_off",
    amountOffCents: 2000,
  };

  it("writes the preview sentence in plain words", () => {
    expect(challengeRuleLine(dish)).toBe("Order the Peri-peri chicken 2 times in 30 days");
  });

  it("accepts one dish and refuses both or neither", () => {
    expect(validateChallenge(dish).ok).toBe(true);
    expect(validateChallenge({ ...dish, menuItemId: null, menuSectionId: null }).ok).toBe(false);
    expect(
      validateChallenge({ ...dish, menuSectionId: "22222222-2222-4222-8222-222222222222" }).ok,
    ).toBe(false);
  });

  it("refuses a count of zero", () => {
    expect(validateChallenge({ ...dish, visits: 0 }).ok).toBe(false);
  });
});

describe("validateChallenge", () => {
  it("accepts a visits challenge with a stamp reward", () => {
    const result = validateChallenge(base);
    expect(result.ok).toBe(true);
  });

  it("rejects a visit count outside 2 to 50", () => {
    expect(validateChallenge({ ...base, visits: 1 }).ok).toBe(false);
    expect(validateChallenge({ ...base, visits: 51 }).ok).toBe(false);
  });

  it("requires at least one weekday for quiet days", () => {
    const result = validateChallenge({ ...base, kind: "quiet_days", weekdays: [] });
    expect(result.ok).toBe(false);
  });

  it("requires the end hour to be after the start hour", () => {
    const result = validateChallenge({ ...base, kind: "quiet_days", weekdays: [1], startHour: 15, endHour: 14 });
    expect(result.ok).toBe(false);
  });

  it("requires a discount between 1 and 100 for percent_off", () => {
    expect(validateChallenge({ ...base, rewardType: "percent_off", percentOff: 0 }).ok).toBe(false);
    expect(validateChallenge({ ...base, rewardType: "percent_off", percentOff: 10 }).ok).toBe(true);
  });

  it("requires an item name for free_item and clears stamp fields", () => {
    expect(validateChallenge({ ...base, rewardType: "free_item", rewardItem: "  " }).ok).toBe(false);
    const ok = validateChallenge({ ...base, rewardType: "free_item", rewardItem: " Muffin ", validDays: 30 });
    expect(ok.ok && ok.value.rewardItem).toBe("Muffin");
    expect(ok.ok && ok.value.bonusStamps).toBe(0);
  });

  it("drops the valid-days value for stamp rewards", () => {
    const result = validateChallenge({ ...base, validDays: 30 });
    expect(result.ok && result.value.validDays).toBe(null);
  });
});

describe("validateReferrals", () => {
  const referral = {
    enabled: true,
    limitPerMonth: 2,
    referrerRewardType: "stamps" as const,
    referrerRewardItem: "",
    referrerPercentOff: null,
    referrerAmountOffCents: null,
    friendRewardType: "amount_off" as const,
    friendRewardItem: "",
    friendPercentOff: null,
    friendAmountOffCents: 2000,
    validDays: 30,
  };

  it("accepts a sensible setup", () => {
    expect(validateReferrals(referral).ok).toBe(true);
  });

  it("caps the monthly limit at 20", () => {
    expect(validateReferrals({ ...referral, limitPerMonth: 21 }).ok).toBe(false);
  });
});

describe("wording", () => {
  it("states the visit rule in plain words", () => {
    expect(challengeRuleLine({ kind: "visits", visits: 3, windowDays: 14, weekdays: [], startHour: null, endHour: null })).toBe(
      "Visit 3 times in 14 days",
    );
  });

  it("states reward lines for each type", () => {
    expect(rewardLine("percent_off", { percent: 10 })).toBe("10% off the bill");
    expect(rewardLine("amount_off", { amountCents: 2000 })).toBe("R20 off the bill");
    expect(rewardLine("free_item", { item: "coffee" })).toBe("A free coffee");
  });
});
