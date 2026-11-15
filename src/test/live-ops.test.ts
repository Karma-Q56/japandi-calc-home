import { describe, expect, it } from "vitest";
import {
  formatRands,
  isValidReason,
  isValidSlug,
  newCreditReference,
  parseRands,
  slugFromName,
} from "@/lib/live-ops";
import { centsToRands, messageForRefusal, randsToCents, refusalCode } from "@/server/live-ops";

describe("parseRands", () => {
  it("reads plain rands and cents", () => {
    expect(parseRands("250")).toBe(25000);
    expect(parseRands("1250.5")).toBe(125050);
    expect(parseRands("0.01")).toBe(1);
  });

  it("accepts a comma decimal and spaces", () => {
    expect(parseRands("1 250,50")).toBe(125050);
  });

  it("refuses zero, negatives, too many decimals and words", () => {
    expect(parseRands("0")).toBeNull();
    expect(parseRands("-5")).toBeNull();
    expect(parseRands("1.234")).toBeNull();
    expect(parseRands("ten")).toBeNull();
    expect(parseRands("")).toBeNull();
  });
});

describe("formatRands and centsToRands", () => {
  it("shows two decimals and a space thousands separator", () => {
    expect(formatRands(125050)).toBe("R1 250.50");
    expect(formatRands(5)).toBe("R0.05");
    expect(centsToRands(100000000)).toBe("R1 000 000.00");
  });

  it("round trips with parseRands", () => {
    const cents = parseRands("9 999.99");
    expect(cents).not.toBeNull();
    expect(randsToCents("9999.99")).toBe(cents);
  });
});

describe("slugFromName and isValidSlug", () => {
  it("makes a clean web address from a name", () => {
    expect(slugFromName("  Café Ole's & Co!  ")).toBe("caf-ole-s-co");
    expect(slugFromName("---")).toBe("");
  });

  it("accepts only lowercase letters, digits and single dashes", () => {
    expect(isValidSlug("cafe-ole")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("cafe--ole")).toBe(false);
    expect(isValidSlug("-cafe")).toBe(false);
    expect(isValidSlug("Cafe")).toBe(false);
  });
});

describe("isValidReason", () => {
  it("needs three to 200 characters once trimmed", () => {
    expect(isValidReason("  ok  ")).toBe(false);
    expect(isValidReason("refund")).toBe(true);
    expect(isValidReason("x".repeat(201))).toBe(false);
  });
});

describe("newCreditReference", () => {
  it("is 8 to 80 characters and changes with the clock", () => {
    const a = newCreditReference(1_000, () => 0.5);
    const b = newCreditReference(2_000, () => 0.5);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(80);
    expect(a).not.toBe(b);
  });
});

describe("refusalCode", () => {
  it("reads the refusal from the cause chain, not the query text", () => {
    const cause = new Error("not_operator");
    const wrapped = new Error('failed query: select operator_add_credit($1, $2) params: ["x", "y"]', { cause });
    expect(refusalCode(wrapped)).toBe("not_operator");
  });

  it("returns null when the message only mentions a code inside other text", () => {
    expect(refusalCode(new Error("failed query: select slug_taken from x"))).toBeNull();
  });

  it("maps a known code to plain words and anything else to a generic line", () => {
    expect(messageForRefusal("slug_taken")).toBe("That web address is already in use.");
    expect(messageForRefusal("something_new")).toBe("Something went wrong. Nothing changed. Try again.");
    expect(messageForRefusal(null)).toBe("Something went wrong. Nothing changed. Try again.");
  });
});
