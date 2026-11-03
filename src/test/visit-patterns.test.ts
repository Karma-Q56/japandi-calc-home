import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { joinRestaurant } from "@/domain/members";
import { visitPatternFor } from "@/domain/visits";
import { timeOfDayFor, visitPattern } from "@/lib/visits";

beforeEach(() => {
  demoRepo.reset();
});

/** Tuesday mornings, 8am Johannesburg time (6:00 UTC), spread over September. */
const TUESDAYS = [
  "2026-09-01T06:00:00.000Z",
  "2026-09-08T06:00:00.000Z",
  "2026-09-15T06:00:00.000Z",
  "2026-09-22T06:00:00.000Z",
  "2026-09-29T06:00:00.000Z",
];

function stampsFor(membershipId: string, createdAt: string[]) {
  updateDemo((current) => ({
    ...current,
    stamps: current.stamps
      .filter((stamp) => stamp.membershipId !== membershipId)
      .concat(
        createdAt.map((stampIso, index) => ({
          id: `pattern-stamp-${index}`,
          restaurantId: "rest-daily-grind",
          membershipId,
          staffId: null as string | null,
          key: null as string | null,
          createdAt: stampIso,
          status: "valid" as const,
        })),
      ),
  }));
}

describe("per guest visit patterns", () => {
  it("finds the usual day, time of day and average gap in Johannesburg time", () => {
    const pattern = visitPattern(
      TUESDAYS.map((createdAt) => ({ createdAt })),
      "2026-10-01T08:00:00.000Z",
    );
    expect(pattern.visits).toBe(5);
    expect(pattern.usualDays).toEqual([2]);
    expect(pattern.usualTime).toBe("morning");
    expect(pattern.averageGapDays).toBe(7);
    expect(pattern.lastVisitDaysAgo).toBe(2);
    expect(pattern.slipping).toBe(false);
  });

  it("marks a regular as slipping when the quiet stretch dwarfs their usual gap", () => {
    const pattern = visitPattern(
      TUESDAYS.map((createdAt) => ({ createdAt })),
      "2026-10-25T08:00:00.000Z",
    );
    expect(pattern.lastVisitDaysAgo).toBe(26);
    expect(pattern.slipping).toBe(true);
  });

  it("counts stacked stamps on one day as a single visit", () => {
    const pattern = visitPattern(
      [...TUESDAYS.slice(0, 3), TUESDAYS[2] as string].map((createdAt) => ({ createdAt })),
      "2026-10-01T08:00:00.000Z",
    );
    expect(pattern.visits).toBe(3);
  });

  it("skips gap outliers longer than six weeks when averaging", () => {
    const pattern = visitPattern(
      [
        "2026-09-01T06:00:00.000Z",
        "2026-09-08T06:00:00.000Z",
        "2026-09-15T06:00:00.000Z",
        "2026-10-25T06:00:00.000Z",
      ].map((createdAt) => ({ createdAt })),
      "2026-10-27T08:00:00.000Z",
    );
    expect(pattern.averageGapDays).toBe(7);
  });

  it("stays calm with no stamps", () => {
    const pattern = visitPattern([], "2026-10-01T08:00:00.000Z");
    expect(pattern.visits).toBe(0);
    expect(pattern.slipping).toBe(false);
    expect(pattern.usualDays).toEqual([]);
  });

  it("binds hours across the daylight saving offset to Johannesburg time", () => {
    // 11:00 UTC is 13:00 in Johannesburg, so lunchtime.
    expect(timeOfDayFor(Date.parse("2026-09-01T11:00:00.000Z"))).toBe("lunch");
    // 19:00 UTC is 21:00 in Johannesburg, so evening.
    expect(timeOfDayFor(Date.parse("2026-09-01T19:00:00.000Z"))).toBe("evening");
  });

  it("reads the pattern straight from a guest's own stamps", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Lerato",
      phone: "+27 82 123 0090",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    stampsFor(joined.data.membershipId, TUESDAYS);
    const pattern = visitPatternFor(joined.data.membershipId);
    expect(pattern.visits).toBe(5);
    expect(pattern.usualDays).toEqual([2]);
    expect(pattern.usualTime).toBe("morning");
  });
});
