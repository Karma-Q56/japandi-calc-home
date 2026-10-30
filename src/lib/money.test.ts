import { describe, expect, it } from "vitest";
import { formatRand } from "./money";

describe("formatRand", () => {
  it("formats whole rand with a comma thousands separator", () => {
    expect(formatRand(125000)).toBe("R1,250");
    expect(formatRand(0)).toBe("R0");
    expect(formatRand(29900)).toBe("R299");
  });

  it("shows cents only when they matter", () => {
    expect(formatRand(1250)).toBe("R12.50");
    expect(formatRand(35)).toBe("R0.35");
  });

  it("keeps negative amounts readable", () => {
    expect(formatRand(-125000)).toBe("-R1,250");
  });
});
