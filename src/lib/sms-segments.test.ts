import { describe, expect, it } from "vitest";
import { countSegments, isGsm7 } from "./sms-segments";
import { estimateCostCents, formatRand, ledgerWording, parseRandToCents, withFooter } from "./live-campaigns";
import { COST_PER_SEGMENT_CENTS, STOP_FOOTER } from "@/domain/campaigns";

describe("countSegments", () => {
  it.each([
    ["", 0],
    ["Hello", 1],
    ["a".repeat(160), 1],
    ["a".repeat(161), 2],
    ["a".repeat(306), 2],
    ["a".repeat(307), 3],
    ["R50 off your coffee", 1],
    ["Thanks 😀", 1],
    ["a".repeat(70) + "😀", 2],
    ["“Curly quotes” from Word", 1],
    ["“" + "a".repeat(69), 1],
    ["“" + "a".repeat(70), 2],
    ["€5 off", 1],
  ])("counts %j as %i segment(s)", (text, expected) => {
    expect(countSegments(text)).toBe(expected);
  });

  it("counts extended GSM characters as two", () => {
    expect(countSegments("^".repeat(80))).toBe(1);
    expect(countSegments("^".repeat(81))).toBe(2);
  });

  it("switches to Unicode when any character is outside GSM", () => {
    expect(isGsm7("plain text, 50% off!")).toBe(true);
    expect(isGsm7("Thanks 😀")).toBe(false);
    expect(isGsm7("“quotes”")).toBe(false);
  });
});

describe("live campaign helpers", () => {
  it("estimates cost in whole cents from recipients and segments", () => {
    expect(COST_PER_SEGMENT_CENTS).toBe(35);
    expect(estimateCostCents(10, 2)).toBe(700);
    expect(estimateCostCents(0, 3)).toBe(0);
    expect(estimateCostCents(-4, 1)).toBe(0);
  });

  it("formats cents as rands", () => {
    expect(formatRand(0)).toBe("R0.00");
    expect(formatRand(1250)).toBe("R12.50");
    expect(formatRand(705)).toBe("R7.05");
  });

  it("parses owner-typed rand amounts into cents", () => {
    expect(parseRandToCents("500")).toBe(50000);
    expect(parseRandToCents("12.5")).toBe(1250);
    expect(parseRandToCents("R1 200")).toBe(120000);
    expect(parseRandToCents("0")).toBeNull();
    expect(parseRandToCents("abc")).toBeNull();
    expect(parseRandToCents("1.234")).toBeNull();
  });

  it("adds the STOP footer to the text", () => {
    expect(withFooter("Hi")).toBe(`Hi${STOP_FOOTER}`);
  });

  it("gives plain wording for each ledger entry type", () => {
    expect(ledgerWording("reserve")).toBe("Set aside for a campaign");
    expect(ledgerWording("release")).toBe("Set aside was returned");
    expect(ledgerWording("unknown")).toBe("Credit change");
  });
});
