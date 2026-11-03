import { beforeEach, describe, expect, it } from "vitest";
import { QUIET_DAYS, getQuietDay, setQuietDay, subscribeQuietDay } from "@/lib/quiet-day";

beforeEach(() => {
  window.sessionStorage.clear();
  setQuietDay("Tuesday");
});

describe("quiet day", () => {
  it("starts on Tuesday and remembers a new choice", () => {
    expect(getQuietDay()).toBe("Tuesday");
    setQuietDay("Friday");
    expect(getQuietDay()).toBe("Friday");
    expect(window.sessionStorage.getItem("patron.quiet-day")).toBe("Friday");
  });

  it("notifies the planner and contact form when the picker changes", () => {
    let calls = 0;
    const unsubscribe = subscribeQuietDay(() => {
      calls += 1;
    });
    setQuietDay("Wednesday");
    expect(calls).toBe(1);
    unsubscribe();
    setQuietDay("Thursday");
    expect(calls).toBe(1);
  });

  it("has all seven days in order for the picker", () => {
    expect([...QUIET_DAYS]).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });
});
