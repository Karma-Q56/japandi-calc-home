import { describe, expect, it } from "vitest";
import {
  assertPinPresent,
  isPinLocked,
  PIN_LOCK_MINUTES,
  PIN_MAX_FAILS,
  pinHmacHex,
  pinMatches,
  requirePinPepper,
} from "./pg";

describe("till PIN policy", () => {
  it("rejects empty, undefined and non-4-digit PINs with PIN required", () => {
    for (const bad of [undefined, "", "1", "123", "12345", "12a4", " 1234", "1234 "]) {
      expect(() => assertPinPresent(bad), JSON.stringify(bad)).toThrow("PIN required");
    }
    expect(() => assertPinPresent("1234")).not.toThrow();
    expect(() => assertPinPresent("0000")).not.toThrow();
  });

  it("requirePinPepper throws when PIN_PEPPER is not set", () => {
    const saved = process.env["PIN_PEPPER"];
    delete process.env["PIN_PEPPER"];
    try {
      expect(() => requirePinPepper()).toThrow("PIN_PEPPER is not configured.");
      process.env["PIN_PEPPER"] = "test-pepper";
      expect(requirePinPepper()).toBe("test-pepper");
    } finally {
      if (saved === undefined) delete process.env["PIN_PEPPER"];
      else process.env["PIN_PEPPER"] = saved;
    }
  });

  it("pinMatches compares HMACs in constant time", () => {
    const good = pinHmacHex("pepper", "rest", "staff", "1234");
    expect(pinMatches(good, pinHmacHex("pepper", "rest", "staff", "1234"))).toBe(true);
    expect(pinMatches(good, pinHmacHex("pepper", "rest", "staff", "0000"))).toBe(false);
    expect(pinMatches(good, pinHmacHex("other", "rest", "staff", "1234"))).toBe(false);
    expect(pinMatches(good, "not-hex")).toBe(false);
    expect(pinMatches(good, "")).toBe(false);
  });

  it("locks after 5 fails in the window, lifts after 15 minutes", () => {
    const now = Date.now();
    expect(isPinLocked(0, null, now)).toBe(false);
    expect(isPinLocked(PIN_MAX_FAILS - 1, now, now)).toBe(false);
    expect(isPinLocked(PIN_MAX_FAILS, now - 60_000, now)).toBe(true);
    expect(isPinLocked(PIN_MAX_FAILS, now - (PIN_LOCK_MINUTES * 60_000 + 1000), now)).toBe(false);
    expect(isPinLocked(PIN_MAX_FAILS, null, now)).toBe(false);
  });
});
