import { describe, expect, it } from "vitest";
import {
  MAX_PRIZES,
  WHEEL_MODES,
  WHEEL_REFUSAL_CODES,
  blankPrize,
  modeTitle,
  oddsLines,
  prizeEligible,
  prizeSummary,
  validateWheel,
  wheelErrorMessage,
  wheelSegments,
  winChanceLine,
  winLine,
  type WheelPrizeInput,
  type WheelSettingsInput,
} from "./live-wheel";

const prize = (label: string, overrides: Partial<WheelPrizeInput> = {}): WheelPrizeInput => ({
  ...blankPrize(),
  label,
  ...overrides,
});

const wheel = (overrides: Partial<WheelSettingsInput> = {}): WheelSettingsInput => ({
  enabled: true,
  mode: "earned",
  earnEvery: 5,
  floorCents: 0,
  prizes: [prize("Free coffee")],
  ...overrides,
});

describe("validateWheel", () => {
  it("accepts a normal wheel", () => {
    expect(validateWheel(wheel())).toBeNull();
  });

  it("allows exactly 8 prizes and refuses 9", () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => prize(`Prize ${i + 1}`));
    expect(validateWheel(wheel({ prizes: many(MAX_PRIZES) }))).toBeNull();
    expect(validateWheel(wheel({ prizes: many(MAX_PRIZES + 1) }))).toBe("A wheel can have up to 8 prizes.");
  });

  it("checks how often a spin is earned", () => {
    expect(validateWheel(wheel({ earnEvery: 0 }))).toMatch(/every 1 to 50 visits/);
    expect(validateWheel(wheel({ earnEvery: 51 }))).toMatch(/every 1 to 50 visits/);
    expect(validateWheel(wheel({ earnEvery: 2.5 }))).toMatch(/every 1 to 50 visits/);
    expect(validateWheel(wheel({ earnEvery: 1 }))).toBeNull();
    expect(validateWheel(wheel({ earnEvery: 50 }))).toBeNull();
  });

  it("checks the smallest reward value", () => {
    expect(validateWheel(wheel({ floorCents: -1 }))).toMatch(/R0 and R10 000/);
    expect(validateWheel(wheel({ floorCents: 1_000_001 }))).toMatch(/R0 and R10 000/);
  });

  it("names the prize that is wrong", () => {
    expect(validateWheel(wheel({ prizes: [prize("Fine"), prize("")] }))).toBe("Prize 2 needs a name of up to 40 characters.");
    expect(validateWheel(wheel({ prizes: [prize("   ")] }))).toMatch(/Prize 1 needs a name/);
    expect(validateWheel(wheel({ prizes: [prize("x".repeat(41))] }))).toMatch(/Prize 1 needs a name/);
    expect(validateWheel(wheel({ prizes: [prize("A", { weight: 1001 })] }))).toBe("Prize 1 needs a chance between 0 and 1000.");
    expect(validateWheel(wheel({ prizes: [prize("A", { weight: -1 })] }))).toMatch(/chance/);
    expect(validateWheel(wheel({ prizes: [prize("A", { weight: 1.5 })] }))).toMatch(/chance/);
  });

  it("checks the numbers each kind of prize needs", () => {
    expect(validateWheel(wheel({ prizes: [prize("S", { type: "stamps", stamps: 6 })] }))).toBe("Prize 1 can give 1 to 5 bonus stamps.");
    expect(validateWheel(wheel({ prizes: [prize("S", { type: "stamps", stamps: null })] }))).toMatch(/bonus stamps/);
    expect(validateWheel(wheel({ prizes: [prize("S", { type: "stamps", stamps: 3 })] }))).toBeNull();
    expect(validateWheel(wheel({ prizes: [prize("P", { type: "percent_off", percentOff: 0 })] }))).toMatch(/1 to 100/);
    expect(validateWheel(wheel({ prizes: [prize("P", { type: "percent_off", percentOff: 101 })] }))).toMatch(/1 to 100/);
    expect(validateWheel(wheel({ prizes: [prize("P", { type: "percent_off", percentOff: null })] }))).toMatch(/1 to 100/);
    expect(validateWheel(wheel({ prizes: [prize("P", { type: "percent_off", percentOff: 15 })] }))).toBeNull();
    expect(validateWheel(wheel({ prizes: [prize("R", { type: "amount_off", amountOffCents: 0 })] }))).toMatch(/rand amount/);
    expect(validateWheel(wheel({ prizes: [prize("R", { type: "amount_off", amountOffCents: null })] }))).toMatch(/rand amount/);
    expect(validateWheel(wheel({ prizes: [prize("R", { type: "amount_off", amountOffCents: 2000 })] }))).toBeNull();
  });

  it("checks worth and days", () => {
    expect(validateWheel(wheel({ prizes: [prize("A", { valueCents: -1 })] }))).toMatch(/worth/);
    expect(validateWheel(wheel({ prizes: [prize("A", { valueCents: 1_000_001 })] }))).toMatch(/worth/);
    expect(validateWheel(wheel({ prizes: [prize("A", { validDays: 0 })] }))).toMatch(/1 to 365 days/);
    expect(validateWheel(wheel({ prizes: [prize("A", { validDays: 366 })] }))).toMatch(/1 to 365 days/);
    expect(validateWheel(wheel({ prizes: [prize("A", { validDays: 365 })] }))).toBeNull();
  });

  it("will not switch on a wheel with nothing to win, but lets an unfinished wheel be saved while off", () => {
    expect(validateWheel(wheel({ prizes: [] }))).toMatch(/at least one real prize/);
    expect(validateWheel(wheel({ prizes: [prize("Try again", { type: "nothing" })] }))).toMatch(/at least one real prize/);
    expect(validateWheel(wheel({ prizes: [prize("Off", { weight: 0 })] }))).toMatch(/at least one real prize/);
    expect(validateWheel(wheel({ enabled: false, prizes: [] }))).toBeNull();
    expect(validateWheel(wheel({ enabled: false, prizes: [prize("Try again", { type: "nothing" })] }))).toBeNull();
  });

  it("asks the reward decider for a reward worth at least the smallest value", () => {
    const decider = (prizes: WheelPrizeInput[]) => wheel({ mode: "reward_decider", floorCents: 1000, prizes });
    expect(validateWheel(decider([prize("Cheap", { valueCents: 500 })]))).toMatch(/at least the smallest value/);
    expect(validateWheel(decider([prize("Stamps", { type: "stamps", stamps: 2, valueCents: 5000 })]))).toMatch(/smallest value/);
    expect(validateWheel(decider([prize("Big", { valueCents: 1000 })]))).toBeNull();
  });

  it("says a welcome spin needs a real prize", () => {
    expect(validateWheel(wheel({ mode: "join", prizes: [prize("Try again", { type: "nothing" })] }))).toMatch(
      /at least one real prize/,
    );
  });
});

describe("prizeEligible", () => {
  it("never counts a prize with no chance", () => {
    for (const mode of ["join", "earned", "reward_decider"] as const) {
      expect(prizeEligible(prize("A", { weight: 0, valueCents: 9999 }), mode, 0)).toBe(false);
    }
  });
  it("lets an earned spin land on a try again, but not a welcome spin", () => {
    expect(prizeEligible(prize("T", { type: "nothing" }), "earned", 0)).toBe(true);
    expect(prizeEligible(prize("T", { type: "nothing" }), "join", 0)).toBe(false);
  });
  it("only lets the reward decider land on real rewards worth at least the floor", () => {
    expect(prizeEligible(prize("F", { valueCents: 1000 }), "reward_decider", 1000)).toBe(true);
    expect(prizeEligible(prize("F", { valueCents: 999 }), "reward_decider", 1000)).toBe(false);
    expect(prizeEligible(prize("S", { type: "stamps", stamps: 1, valueCents: 5000 }), "reward_decider", 0)).toBe(false);
    expect(prizeEligible(prize("N", { type: "nothing", valueCents: 5000 }), "reward_decider", 0)).toBe(false);
    expect(prizeEligible(prize("P", { type: "percent_off", percentOff: 10, valueCents: 2000 }), "reward_decider", 1000)).toBe(true);
  });
});

describe("odds in plain words", () => {
  it("explains each prize and the share of winning spins", () => {
    const input = wheel({
      prizes: [prize("Free coffee", { weight: 1 }), prize("Try again", { type: "nothing", weight: 3 })],
    });
    expect(oddsLines(input)).toEqual([
      "About 1 spin in 4 wins Free coffee.",
      'About 75 in 100 spins land on "Try again".',
    ]);
    expect(winChanceLine(input)).toBe("About 25 in 100 spins win a prize.");
  });

  it("says every spin when one prize has all the weight", () => {
    const input = wheel({ prizes: [prize("Free coffee", { weight: 5 })] });
    expect(oddsLines(input)).toEqual(["Every spin wins Free coffee."]);
    expect(winChanceLine(input)).toBe("Every spin wins a prize.");
  });

  it("ignores prizes that cannot be won", () => {
    const input = wheel({ prizes: [prize("Off", { weight: 0 }), prize("On", { weight: 2 })] });
    expect(oddsLines(input)).toEqual(["Every spin wins On."]);
  });

  it("never says 100 in 100 or 1 spin in 1 when a prize is nearly certain", () => {
    const input = wheel({ prizes: [prize("Big", { weight: 1000 }), prize("Rare", { weight: 1 })] });
    expect(oddsLines(input)[0]).toBe("About 99 in 100 spins win Big.");
    expect(oddsLines(input)[1]).toMatch(/^About 1 spin in \d{2,} wins Rare\.$/);
  });

  it("says try again for a prize that wins nothing", () => {
    const input = wheel({ prizes: [prize("Try again", { type: "nothing", weight: 1 }), prize("Free", { weight: 1 })] });
    expect(oddsLines(input)[0]).toBe('About 1 spin in 2 lands on "Try again".');
  });

  it("gives nothing when there is nothing to win", () => {
    expect(oddsLines(wheel({ prizes: [] }))).toEqual([]);
    expect(winChanceLine(wheel({ prizes: [prize("Off", { weight: 0 })] }))).toBeNull();
  });

  it("falls back to the prize summary for a prize without a name yet", () => {
    expect(oddsLines(wheel({ prizes: [prize("", { type: "percent_off", percentOff: 10 })] }))).toEqual([
      "Every spin wins 10% off.",
    ]);
  });
});

describe("prizeSummary", () => {
  it("says what the guest gets", () => {
    expect(prizeSummary(prize("a", { type: "stamps", stamps: 1 }))).toBe("1 bonus stamp");
    expect(prizeSummary(prize("a", { type: "stamps", stamps: 3 }))).toBe("3 bonus stamps");
    expect(prizeSummary(prize("a", { type: "percent_off", percentOff: 15 }))).toBe("15% off");
    expect(prizeSummary(prize("a", { type: "amount_off", amountOffCents: 2000 }))).toBe("R20 off");
    expect(prizeSummary(prize("a", { type: "amount_off", amountOffCents: 2550 }))).toBe("R25.50 off");
    expect(prizeSummary(prize("a", { type: "free_item" }))).toBe("A free item");
    expect(prizeSummary(prize("a", { type: "nothing" }))).toBe("Nothing, try again");
  });
});

describe("wheel pictures and words", () => {
  it("gives guests equal slices and owners real weights", () => {
    expect(wheelSegments([{ id: "a", label: "A" }, { id: "b", label: "B" }])).toEqual([
      { id: "a", label: "A", weight: 1, valueCents: 0 },
      { id: "b", label: "B", weight: 1, valueCents: 0 },
    ]);
    expect(wheelSegments([{ id: "a", label: "A", weight: 7 }])[0]?.weight).toBe(7);
  });

  it("names the three kinds of wheel in plain words", () => {
    expect(WHEEL_MODES.map((mode) => mode.mode)).toEqual(["join", "earned", "reward_decider"]);
    expect(modeTitle("join")).toBe("Welcome spin");
    expect(modeTitle("reward_decider")).toBe("Reward decider");
  });

  it("turns every refusal the database can raise into plain words", () => {
    for (const code of WHEEL_REFUSAL_CODES) {
      const message = wheelErrorMessage(code);
      expect(message).not.toBe(wheelErrorMessage(null));
      expect(message).not.toContain("_");
    }
    expect(wheelErrorMessage("something_new")).toBe("Something went wrong. Please try again.");
    expect(wheelErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("tells a guest what they won", () => {
    const base = { label: "Free coffee", prizeType: "free_item" as const, bonusStamps: null, keptAdvertised: false };
    expect(winLine(base)).toBe("Your prize is on your card. Show it at the till.");
    expect(winLine({ ...base, prizeType: "nothing" })).toBe("No prize this time. Visit again for another spin.");
    expect(winLine({ ...base, prizeType: "stamps", bonusStamps: 1 })).toBe("1 bonus stamp added to your card.");
    expect(winLine({ ...base, prizeType: "stamps", bonusStamps: 2 })).toBe("2 bonus stamps added to your card.");
    expect(winLine({ ...base, keptAdvertised: true })).toMatch(/keep the reward you earned/);
  });

  it("uses no long dashes in anything an owner or guest reads", () => {
    const text = [
      ...WHEEL_MODES.flatMap((mode) => [mode.title, mode.description]),
      ...WHEEL_REFUSAL_CODES.map((code) => wheelErrorMessage(code)),
    ].join(" ");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});
