import { describe, expect, it } from "vitest";
import {
  branchLabel,
  canAddBranch,
  locationErrorMessage,
  validateLocation,
} from "@/lib/live-locations";

describe("validateLocation", () => {
  const base = { name: "Parkhurst", address: "1 Main Road", suburb: "Parkhurst", city: "Johannesburg" };

  it("accepts a normal branch", () => {
    expect(validateLocation(base)).toEqual({ ok: true });
  });

  it("refuses an empty name and a name over 80 letters", () => {
    expect(validateLocation({ ...base, name: "   " }).ok).toBe(false);
    expect(validateLocation({ ...base, name: "a".repeat(81) }).ok).toBe(false);
    expect(validateLocation({ ...base, name: "a".repeat(80) }).ok).toBe(true);
  });

  it("refuses an address over 200 letters and accepts exactly 200", () => {
    expect(validateLocation({ ...base, address: "a".repeat(201) }).ok).toBe(false);
    expect(validateLocation({ ...base, address: "a".repeat(200) }).ok).toBe(true);
  });

  it("refuses a missing city", () => {
    expect(validateLocation({ ...base, city: "" })).toEqual({
      ok: false,
      message: "Add the city for this branch.",
    });
  });
});

describe("locationErrorMessage", () => {
  it("gives the plan wording for one branch and for several", () => {
    expect(locationErrorMessage("plan_limit_locations", 1)).toBe(
      "Your plan includes 1 branch. Ask Patron to change your plan.",
    );
    expect(locationErrorMessage("plan_limit_locations", 3)).toBe(
      "Your plan includes 3 branches. Ask Patron to change your plan.",
    );
  });

  it("explains a refused main branch change in plain words", () => {
    expect(locationErrorMessage("main_location")).toBe(
      "The main branch cannot be turned off. Make another branch the main one first.",
    );
  });

  it("never shows a raw refusal code", () => {
    for (const code of ["plan_limit_locations", "main_location", "invalid_value", "not_found", null, "other"]) {
      expect(locationErrorMessage(code, 3)).not.toMatch(/_/);
    }
  });
});

describe("branchLabel and canAddBranch", () => {
  it("tags the main branch", () => {
    expect(branchLabel("Parkhurst", true)).toBe("Parkhurst (main)");
    expect(branchLabel("Sandton", false)).toBe("Sandton");
  });

  it("allows a new branch only below the plan limit", () => {
    expect(canAddBranch(0, 1)).toBe(true);
    expect(canAddBranch(1, 1)).toBe(false);
    expect(canAddBranch(2, 3)).toBe(true);
    expect(canAddBranch(3, 3)).toBe(false);
  });
});
