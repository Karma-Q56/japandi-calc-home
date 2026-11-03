import { describe, expect, it } from "vitest";
import { canOpenArea, landingForRole } from "@/lib/auth-rules";
import { isValidSAMobile, normalizePhone } from "@/lib/phone";

describe("auth landing per role", () => {
  it("sends each role to its own home", () => {
    expect(landingForRole("guest")).toBe("/me");
    expect(landingForRole("owner")).toBe("/app");
    expect(landingForRole("manager")).toBe("/app");
    expect(landingForRole("operator")).toBe("/ops/restaurants");
  });

  it("keeps guests out of the owner and operator areas", () => {
    expect(canOpenArea("guest", "app")).toBe(false);
    expect(canOpenArea("guest", "ops")).toBe(false);
    expect(canOpenArea("guest", "me")).toBe(true);
  });

  it("lets owners and managers into the owner area only", () => {
    expect(canOpenArea("owner", "app")).toBe(true);
    expect(canOpenArea("manager", "app")).toBe(true);
    expect(canOpenArea("owner", "ops")).toBe(false);
    expect(canOpenArea("manager", "me")).toBe(false);
  });

  it("lets only the operator into the operator area", () => {
    expect(canOpenArea("operator", "ops")).toBe(true);
    expect(canOpenArea("operator", "app")).toBe(false);
    expect(canOpenArea("operator", "me")).toBe(false);
  });
});

describe("phone rules used at sign-up", () => {
  it("normalises South African mobile numbers", () => {
    expect(normalizePhone("082 123 4567")).toBe("+27821234567");
    expect(normalizePhone("+27 82 123 4567")).toBe("+27821234567");
  });

  it("rejects landlines and nonsense", () => {
    expect(isValidSAMobile("011 555 0100")).toBe(false);
    expect(isValidSAMobile("not a number")).toBe(false);
    expect(isValidSAMobile("082 123 4567")).toBe(true);
  });
});
