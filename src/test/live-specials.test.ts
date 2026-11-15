import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isValidCodeShape,
  johannesburgInstant,
  makeSpecialCode,
  specialGivesLine,
  validateSpecial,
  type LiveSpecialInput,
} from "@/lib/live-specials";

const base: LiveSpecialInput = {
  title: "  Lunch deal  ",
  reward: "Free coffee   with lunch",
  kind: "public",
  startsAt: "",
  endsAt: "",
  percentOff: null,
  amountOffCents: null,
  active: true,
};

describe("johannesburgInstant", () => {
  it("reads a local time as UTC+2 with no daylight saving", () => {
    expect(johannesburgInstant("2026-11-08T12:00")?.toISOString()).toBe("2026-11-08T10:00:00.000Z");
    expect(johannesburgInstant("2026-01-15T00:30")?.toISOString()).toBe("2026-01-14T22:30:00.000Z");
  });

  it("rejects text that is not a real date and time", () => {
    expect(johannesburgInstant("2026-02-31T10:00")).toBeNull();
    expect(johannesburgInstant("2026-13-01T10:00")).toBeNull();
    expect(johannesburgInstant("2026-11-08T24:00")).toBeNull();
    expect(johannesburgInstant("not a date")).toBeNull();
  });
});

describe("validateSpecial", () => {
  it("cleans the title and reward and keeps a valid special", () => {
    const result = validateSpecial(base);
    expect(result).toEqual({
      ok: true,
      value: { ...base, title: "Lunch deal", reward: "Free coffee with lunch" },
    });
  });

  it("refuses a blank title and a blank reward", () => {
    expect(validateSpecial({ ...base, title: "   " }).ok).toBe(false);
    expect(validateSpecial({ ...base, reward: "" }).ok).toBe(false);
  });

  it("refuses an unknown kind", () => {
    expect(validateSpecial({ ...base, kind: "vip" as LiveSpecialInput["kind"] }).ok).toBe(false);
  });

  it("allows only one kind of discount, and only in range", () => {
    expect(validateSpecial({ ...base, percentOff: 10, amountOffCents: 500 }).ok).toBe(false);
    expect(validateSpecial({ ...base, percentOff: 0 }).ok).toBe(false);
    expect(validateSpecial({ ...base, percentOff: 101 }).ok).toBe(false);
    expect(validateSpecial({ ...base, percentOff: 10 }).ok).toBe(true);
    expect(validateSpecial({ ...base, amountOffCents: 0 }).ok).toBe(false);
  });

  it("requires the start to be before the end", () => {
    const sameTime = validateSpecial({
      ...base,
      startsAt: "2026-11-08T10:00",
      endsAt: "2026-11-08T10:00",
    });
    expect(sameTime.ok).toBe(false);
    const ordered = validateSpecial({
      ...base,
      startsAt: "2026-11-08T10:00",
      endsAt: "2026-11-09T10:00",
    });
    expect(ordered.ok).toBe(true);
  });
});

describe("specialGivesLine", () => {
  it("names the discount before the reward", () => {
    expect(specialGivesLine({ reward: "Dessert", percentOff: 15, amountOffCents: null })).toBe(
      "15% off. Dessert",
    );
    expect(specialGivesLine({ reward: "Dessert", percentOff: null, amountOffCents: 2500 })).toBe(
      "R25.00 off. Dessert",
    );
    expect(specialGivesLine({ reward: "Dessert", percentOff: null, amountOffCents: null })).toBe(
      "Dessert",
    );
  });
});

describe("makeSpecialCode", () => {
  it("makes a code of the right length from the easy alphabet", () => {
    const code = makeSpecialCode();
    expect(code).toHaveLength(CODE_LENGTH);
    expect(isValidCodeShape(code)).toBe(true);
  });

  it("uses only the easy alphabet, with no 0, O, 1 or I", () => {
    expect(CODE_ALPHABET).not.toMatch(/[0OI1]/);
  });

  it("builds the code from the random source it is given", () => {
    const code = makeSpecialCode(() => 0);
    expect(code).toBe(CODE_ALPHABET[0]!.repeat(CODE_LENGTH));
  });
});

describe("isValidCodeShape", () => {
  it("accepts a code in any case and rejects the wrong shape", () => {
    expect(isValidCodeShape("ABCDEFG")).toBe(true);
    expect(isValidCodeShape("abcdefg")).toBe(true);
    expect(isValidCodeShape("ABC")).toBe(false);
    expect(isValidCodeShape("ABCDEF0")).toBe(false);
  });
});
