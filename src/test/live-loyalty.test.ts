import { describe, expect, it } from "vitest";
import { validateLoyaltySettings, type LiveLoyaltyInput } from "@/lib/live-loyalty";

const valid: LiveLoyaltyInput = {
  stampsRequired: 8,
  rewardDescription: "A free flat white",
  rewardKind: "free_item",
  rewardPercentOff: null,
  rewardAmountOffCents: null,
  rewardValidDays: null,
  visitWindowMinutes: 240,
  welcomeStamp: true,
  marketingWeeklyCap: 3,
  memberWeeklyCap: 2,
};

describe("live loyalty settings", () => {
  it("accepts the normal ranges", () => {
    expect(validateLoyaltySettings(valid)).toEqual({
      ok: true,
      reward: "A free flat white",
    });
  });

  it("rejects a stamp goal outside 2 to 30", () => {
    expect(validateLoyaltySettings({ ...valid, stampsRequired: 1 }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...valid, stampsRequired: 31 }).ok).toBe(false);
  });

  it("rejects empty rewards and bad weekly caps", () => {
    expect(validateLoyaltySettings({ ...valid, rewardDescription: " " }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...valid, marketingWeeklyCap: 15 }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...valid, memberWeeklyCap: -1 }).ok).toBe(false);
  });

  it("checks the value that matches the reward kind", () => {
    const percent = { ...valid, rewardKind: "percent_off" as const, rewardPercentOff: 15 };
    expect(validateLoyaltySettings(percent).ok).toBe(true);
    expect(validateLoyaltySettings({ ...percent, rewardPercentOff: null }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...percent, rewardPercentOff: 101 }).ok).toBe(false);

    const rand = { ...valid, rewardKind: "amount_off" as const, rewardAmountOffCents: 5000 };
    expect(validateLoyaltySettings(rand).ok).toBe(true);
    expect(validateLoyaltySettings({ ...rand, rewardAmountOffCents: 0 }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...rand, rewardPercentOff: 10 }).ok).toBe(false);

    expect(validateLoyaltySettings({ ...valid, rewardPercentOff: 10 }).ok).toBe(false);
  });

  it("limits reward validity to 1 to 365 days or no limit", () => {
    expect(validateLoyaltySettings({ ...valid, rewardValidDays: 30 }).ok).toBe(true);
    expect(validateLoyaltySettings({ ...valid, rewardValidDays: 0 }).ok).toBe(false);
    expect(validateLoyaltySettings({ ...valid, rewardValidDays: 366 }).ok).toBe(false);
  });

  it("allows a zero minute window and zero caps", () => {
    expect(
      validateLoyaltySettings({
        ...valid,
        visitWindowMinutes: 0,
        marketingWeeklyCap: 0,
        memberWeeklyCap: 0,
      }).ok,
    ).toBe(true);
  });
});
