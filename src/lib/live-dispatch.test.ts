import { describe, expect, it } from "vitest";
import { canRetry, isStopReply, sendAtOrDefer, toE164, withStopFooter } from "./live-dispatch";
import { STOP_FOOTER } from "@/domain/campaigns";

// Fixed clocks, so these tests never depend on the day or hour.
const ELEVEN_AM_SAST = Date.UTC(2026, 0, 15, 9, 0); // 11:00 SAST
const THREE_AM_SAST = Date.UTC(2026, 0, 15, 1, 0); // 03:00 SAST

describe("isStopReply", () => {
  it("recognises opt-out words in any case and with spacing", () => {
    expect(isStopReply("STOP")).toBe(true);
    expect(isStopReply("  stop. ")).toBe(true);
    expect(isStopReply("Unsubscribe")).toBe(true);
  });

  it("ignores ordinary replies", () => {
    expect(isStopReply("please stop sending me the menu")).toBe(false);
    expect(isStopReply("thanks")).toBe(false);
    expect(isStopReply("")).toBe(false);
  });
});

describe("sendAtOrDefer", () => {
  it("sends now during the day", () => {
    expect(sendAtOrDefer(ELEVEN_AM_SAST)).toBe(ELEVEN_AM_SAST);
  });

  it("defers a message in quiet hours to 08:00 SAST", () => {
    const deferred = sendAtOrDefer(THREE_AM_SAST);
    expect(deferred).toBeGreaterThan(THREE_AM_SAST);
    // 08:00 SAST is 06:00 UTC on the same day.
    expect(new Date(deferred).getUTCHours()).toBe(6);
  });
});

describe("withStopFooter", () => {
  it("adds the STOP footer once", () => {
    expect(withStopFooter("Hi there")).toBe(`Hi there${STOP_FOOTER}`);
    const once = withStopFooter("Hi there");
    expect(withStopFooter(once)).toBe(once);
  });
});

describe("canRetry", () => {
  it("allows retries until the attempt limit", () => {
    expect(canRetry(0, 3)).toBe(true);
    expect(canRetry(2, 3)).toBe(true);
    expect(canRetry(3, 3)).toBe(false);
  });
});

describe("toE164", () => {
  it("converts South African numbers", () => {
    expect(toE164("082 123 4567")).toBe("+27821234567");
    expect(toE164("+27 82 123 4567")).toBe("+27821234567");
  });

  it("returns null for numbers it cannot use", () => {
    expect(toE164("12345")).toBeNull();
  });
});
