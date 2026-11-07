import { describe, expect, it } from "vitest";
import {
  formatRand,
  rewardCountLabel,
  rewardGiveLine,
  rewardGuestLine,
} from "@/lib/reward-copy";

describe("reward wording", () => {
  it("formats rand amounts the way shops write them", () => {
    expect(formatRand(2000)).toBe("R20");
    expect(formatRand(2050)).toBe("R20.50");
    expect(formatRand(2005)).toBe("R20.05");
    expect(formatRand(50)).toBe("R0.50");
  });

  it("tells staff exactly what to give or take", () => {
    expect(rewardGiveLine({ kind: "free_item", description: "A free flat white" })).toBe(
      "Give: A free flat white",
    );
    expect(rewardGiveLine({ kind: "percent_off", description: "x", percentOff: 15 })).toBe(
      "Take 15% off the bill",
    );
    expect(rewardGiveLine({ kind: "amount_off", description: "x", amountOffCents: 5000 })).toBe(
      "Take R50 off the bill",
    );
  });

  it("tells guests what they have, with an optional use-by date", () => {
    expect(rewardGuestLine({ kind: "free_item", description: "A free muffin" })).toBe(
      "A free muffin",
    );
    expect(
      rewardGuestLine({ kind: "percent_off", description: "x", percentOff: 10 }, "30 Nov 2026"),
    ).toBe("10% off your bill. Use by 30 Nov 2026");
    expect(
      rewardGuestLine({ kind: "amount_off", description: "x", amountOffCents: 2550 }),
    ).toBe("R25.50 off your bill");
  });

  it("uses singular and plural counts", () => {
    expect(rewardCountLabel(1)).toBe("1 reward");
    expect(rewardCountLabel(0)).toBe("0 rewards");
    expect(rewardCountLabel(3)).toBe("3 rewards");
  });
});
