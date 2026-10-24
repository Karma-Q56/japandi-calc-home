import { describe, expect, it } from "vitest";
import { johannesburgTime, venueIsOpenNow } from "./johannesburg-time";

describe("Johannesburg venue time", () => {
  it("uses one local weekday for the highlighted row and Today text", () => {
    const fixedClock = Date.parse("2026-10-21T22:30:00.000Z");
    const hours = {
      Monday: null,
      Tuesday: null,
      Wednesday: { open: "07:00", close: "23:00" },
      Thursday: { open: "07:00", close: "16:00" },
      Friday: null,
      Saturday: null,
      Sunday: null,
    };
    const local = johannesburgTime(fixedClock);
    const highlightedDay = Object.keys(hours).find((day) => day === local.weekday);
    const todayLine = `Today is ${local.weekday}.`;

    expect(local.weekday).toBe("Thursday");
    expect(highlightedDay).toBe("Thursday");
    expect(todayLine).toBe("Today is Thursday.");
    expect(local.time).toBe("00:30");
    expect(venueIsOpenNow(hours, fixedClock)).toBe(false);
  });

  it("compares opening hours against the same Johannesburg-local instant", () => {
    const fixedClock = Date.parse("2026-10-21T10:00:00.000Z");
    expect(johannesburgTime(fixedClock).time).toBe("12:00");
    expect(venueIsOpenNow({ Wednesday: { open: "11:00", close: "13:00" } }, fixedClock)).toBe(true);
  });
});
