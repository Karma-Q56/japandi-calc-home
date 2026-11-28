import { describe, expect, it } from "vitest";
import { CHECK_THE_BOXES, NO_ANSWER, safely } from "@/lib/server-call";
import { specialStatus } from "@/server/live-specials";

describe("a server call that fails", () => {
  it("answers in plain words instead of throwing", async () => {
    const checks = new Error(JSON.stringify([{ code: "too_big", path: ["visits"] }]));
    expect(await safely(Promise.reject(checks))).toEqual({ ok: false, message: CHECK_THE_BOXES });
    expect(await safely(Promise.reject(new TypeError("Failed to fetch")))).toEqual({
      ok: false,
      message: NO_ANSWER,
    });
    expect(await safely(Promise.resolve({ ok: true }))).toEqual({ ok: true });
  });
});

describe("a special that was ended", () => {
  it("says ended, not paused", () => {
    const now = new Date("2026-11-28T10:00:00Z");
    const over = { active: false, starts_at: "", ends_at: "2026-11-28T09:00:00Z" };
    expect(specialStatus(over, now)).toBe("ended");
    expect(specialStatus({ ...over, ends_at: "" }, now)).toBe("paused");
  });
});
