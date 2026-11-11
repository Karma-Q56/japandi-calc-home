import { describe, expect, it } from "vitest";
import { probabilitySentence, validateWheel, wheelErrorMessage, type WheelInput } from "./live-wheel";

const prize = (over: Partial<WheelInput["prizes"][number]> = {}) => ({
  label: "Free coffee",
  weight: 10,
  rewardType: "free_item" as const,
  bonusStamps: null,
  rewardItem: "Coffee",
  percentOff: null,
  amountOffCents: null,
  validDays: 30,
  ...over,
});

const wheel = (over: Partial<WheelInput> = {}): WheelInput => ({
  enabled: true,
  mode: "earned",
  earnEveryVisits: 5,
  prizes: [prize()],
  ...over,
});

describe("probabilitySentence", () => {
  it("gives whole-number percentages from the weights", () => {
    expect(probabilitySentence([{ label: "A", weight: 1 }, { label: "B", weight: 3 }])).toBe(
      "Each spin: A 25%, B 75%.",
    );
  });

  it("asks for a prize when there are none", () => {
    expect(probabilitySentence([])).toBe("Add at least one prize to see the chances.");
  });

  it("names an untitled prize plainly", () => {
    expect(probabilitySentence([{ label: "  ", weight: 5 }])).toBe("Each spin: Untitled prize 100%.");
  });
});

describe("validateWheel", () => {
  it("accepts a sound wheel", () => {
    expect(validateWheel(wheel())).toEqual([]);
  });

  it("refuses more than eight prizes", () => {
    const nine = wheel({ prizes: Array.from({ length: 9 }, () => prize()) });
    expect(validateWheel(nine).length).toBeGreaterThan(0);
  });

  it("refuses a wheel with no prize", () => {
    expect(validateWheel(wheel({ prizes: [] })).length).toBeGreaterThan(0);
  });

  it("refuses a prize with no name", () => {
    expect(validateWheel(wheel({ prizes: [prize({ label: " " })] })).length).toBeGreaterThan(0);
  });

  it("refuses a free item with no item named", () => {
    expect(validateWheel(wheel({ prizes: [prize({ rewardItem: "" })] })).length).toBeGreaterThan(0);
  });

  it("refuses percent off above 100", () => {
    const bad = prize({ rewardType: "percent_off", rewardItem: "", percentOff: 150 });
    expect(validateWheel(wheel({ prizes: [bad] })).length).toBeGreaterThan(0);
  });

  it("refuses rand off with no amount", () => {
    const bad = prize({ rewardType: "amount_off", rewardItem: "", amountOffCents: 0 });
    expect(validateWheel(wheel({ prizes: [bad] })).length).toBeGreaterThan(0);
  });

  it("refuses a spin for every zero visits", () => {
    expect(validateWheel(wheel({ earnEveryVisits: 0 })).length).toBeGreaterThan(0);
    expect(validateWheel(wheel({ earnEveryVisits: 0 }))[0]).toMatch(/1 to 100 visits/);
  });
});

describe("wheelErrorMessage", () => {
  it("gives owner-plain text for each refusal code", () => {
    expect(wheelErrorMessage("no_spin")).toMatch(/no spins left/i);
    expect(wheelErrorMessage("too_many_prizes")).toMatch(/8 prizes/i);
    expect(wheelErrorMessage("not_a_member")).toMatch(/membership/i);
  });

  it("falls back to a safe message", () => {
    expect(wheelErrorMessage("something_new")).toMatch(/try again/i);
    expect(wheelErrorMessage(null)).toMatch(/try again/i);
  });
});
