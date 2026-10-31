import { describe, expect, it } from "vitest";
import { formatRand } from "@/lib/money";

describe("formatRand", () => {
  it("keeps cents and thousands in one price", () => {
    expect(formatRand(110001)).toBe("R1,100.01");
    expect(formatRand(123456789)).toBe("R1,234,567.89");
  });

  it("drops the decimal part when there are no cents", () => {
    expect(formatRand(1250)).toBe("R12.50");
    expect(formatRand(120000)).toBe("R1,200");
    expect(formatRand(0)).toBe("R0");
  });

  it("puts the minus before the rand sign", () => {
    expect(formatRand(-62000)).toBe("-R620");
    expect(formatRand(-110001)).toBe("-R1,100.01");
  });

  it("rounds to the nearest cent", () => {
    expect(formatRand(110050.6)).toBe("R1,100.51");
  });
});
