import { describe, expect, it } from "vitest";
import { validateLoyaltySettings, type LiveLoyaltyInput } from "@/lib/live-loyalty";

const valid: LiveLoyaltyInput = {
  stampsRequired: 8,
  rewardDescription: "A free flat white",
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
