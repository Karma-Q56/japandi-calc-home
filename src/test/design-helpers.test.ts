import { describe, expect, it } from "vitest";
import { plural } from "@/lib/plural";
import { timeAgo } from "@/lib/time-ago";
import { theVenueName, venueName } from "@/lib/venue-name";

describe("shared wording helpers", () => {
  it("uses singular and plural forms", () => {
    expect(plural(1, "month")).toBe("1 month");
    expect(plural(0, "month")).toBe("0 months");
    expect(plural(2, "visit", "visits")).toBe("2 visits");
  });

  it("keeps relative dates plain and grammatical", () => {
    const now = Date.UTC(2026, 10, 4, 10);
    expect(timeAgo(now - 30_000, now)).toBe("Just now");
    expect(timeAgo(now - 86_400_000, now)).toBe("Yesterday");
    expect(timeAgo(now - 5 * 86_400_000, now)).toBe("5 days ago");
    expect(timeAgo(now - 31 * 86_400_000, now)).toBe("1 month ago");
    expect(timeAgo(now - 61 * 86_400_000, now)).toBe("2 months ago");
    expect(timeAgo(now - 365 * 86_400_000, now)).toBe("1 year ago");
    expect(timeAgo(now - 5 * 86_400_000, now)).not.toContain("last in");
    expect(timeAgo(now - 31 * 86_400_000, now)).not.toBe("1 months ago");
    expect(timeAgo(now - 5 * 86_400_000, now)).not.toBe("last in 5 days ago");
  });

  it("never prints a doubled article", () => {
    expect(venueName("The The Oak Table")).toBe("The Oak Table");
    expect(venueName("the the daily grind")).toBe("The daily grind");
    expect(theVenueName("The Daily Grind")).toBe("The Daily Grind");
    expect(theVenueName("Sunrise Bakes")).toBe("the Sunrise Bakes");
    expect(theVenueName("The The Oak Table")).not.toMatch(/the the/i);
  });
});
