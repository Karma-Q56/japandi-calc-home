import { describe, expect, it } from "vitest";
import { validateMenuItem, validateSectionName } from "@/lib/live-menu";

describe("live menu validation", () => {
  it("trims a normal section name", () => {
    expect(validateSectionName("  Coffee  ")).toEqual({ ok: true, name: "Coffee" });
  });

  it("rejects blank and overlong section names", () => {
    expect(validateSectionName(" ").ok).toBe(false);
    expect(validateSectionName("a".repeat(81)).ok).toBe(false);
  });

  it("accepts a priced item and trims its words", () => {
    expect(
      validateMenuItem({ name: " Flat white ", description: " Two shots ", priceCents: 3800 }),
    ).toEqual({ ok: true, name: "Flat white", description: "Two shots" });
  });

  it("rejects a negative or fractional price", () => {
    expect(validateMenuItem({ name: "Tea", description: "", priceCents: -1 }).ok).toBe(false);
    expect(validateMenuItem({ name: "Tea", description: "", priceCents: 12.5 }).ok).toBe(false);
  });
});
