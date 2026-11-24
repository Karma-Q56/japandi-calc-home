import { describe, expect, it } from "vitest";
import {
  ESTIMATED_SPEND_PER_VISIT_CENTS,
  attentionItems,
  bestRegulars,
  busiestHours,
  dailySeries,
  metricValue,
  peakHour,
  percentChange,
  sastHour,
  sumMetric,
} from "./home-metrics";

// 2026-11-04 10:00 in Johannesburg (SAST, UTC+2).
const NOW = Date.parse("2026-11-04T10:00:00+02:00");

const stamp = (membershipId: string, iso: string, status: "valid" | "undone" = "valid") => ({
  membershipId,
  createdAt: iso,
  status,
});

const member = (id: string, joinedAt: string, lastVisitAt: string | null = null) => ({
  id,
  customerId: `c-${id}`,
  joinedAt,
  stampsCurrent: 0,
  lastVisitAt,
});

describe("percentChange", () => {
  it("compares against yesterday", () => {
    expect(percentChange(10, 5)).toBe(100);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(3, 3)).toBe(0);
  });

  it("returns null rather than a fake zero when there is nothing to compare", () => {
    expect(percentChange(4, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe("dailySeries", () => {
  it("keeps one point per day, oldest first", () => {
    const series = dailySeries([], [], NOW, 7);
    expect(series).toHaveLength(7);
    expect(series[1]!.day - series[0]!.day).toBe(86400000);
    expect(series[6]!.day).toBe(Date.parse("2026-11-04T00:00:00+02:00"));
  });

  it("counts a stamp on its Johannesburg day, not the UTC day", () => {
    // 00:30 SAST on 4 Nov is still 3 Nov in UTC.
    const series = dailySeries([stamp("m1", "2026-11-04T00:30:00+02:00")], [], NOW, 7);
    expect(series[6]!.visits).toBe(1);
    expect(series[5]!.visits).toBe(0);
  });

  it("ignores undone stamps and counts a guest once per day", () => {
    const series = dailySeries(
      [
        stamp("m1", "2026-11-03T12:00:00+02:00"),
        stamp("m1", "2026-11-03T18:00:00+02:00"),
        stamp("m2", "2026-11-03T19:00:00+02:00", "undone"),
      ],
      [],
      NOW,
      7,
    );
    expect(series[5]!.visits).toBe(2);
    expect(series[5]!.unique).toBe(1);
  });

  it("counts new members on the day they joined", () => {
    const series = dailySeries(
      [],
      [member("m1", "2026-11-02T09:00:00+02:00"), member("m2", "2026-11-02T11:00:00+02:00")],
      NOW,
      7,
    );
    expect(series[4]!.newMembers).toBe(2);
  });
});

describe("metricValue", () => {
  const point = { day: 0, visits: 4, unique: 3, newMembers: 2 };

  it("reads the metric the owner picked", () => {
    expect(metricValue(point, "visits")).toBe(4);
    expect(metricValue(point, "unique")).toBe(3);
    expect(metricValue(point, "new")).toBe(2);
  });

  it("estimates sales from visits at the stated spend", () => {
    expect(metricValue(point, "sales")).toBe(4 * ESTIMATED_SPEND_PER_VISIT_CENTS);
    expect(sumMetric([point, point], "sales")).toBe(8 * ESTIMATED_SPEND_PER_VISIT_CENTS);
  });
});

describe("sastHour", () => {
  it("uses Johannesburg hours", () => {
    expect(sastHour(Date.parse("2026-11-04T23:30:00+02:00"))).toBe(23);
    expect(sastHour(Date.parse("2026-11-04T07:05:00+02:00"))).toBe(7);
  });
});

describe("busiestHours and peakHour", () => {
  it("finds the busiest hour", () => {
    const hours = busiestHours(
      [
        stamp("m1", "2026-11-03T12:10:00+02:00"),
        stamp("m2", "2026-11-03T12:40:00+02:00"),
        stamp("m2", "2026-11-03T18:00:00+02:00"),
      ],
      NOW,
    );
    expect(hours).toHaveLength(24);
    expect(peakHour(hours)).toEqual({ hour: 12, visits: 2 });
  });

  it("has no peak when nobody visited", () => {
    expect(peakHour(busiestHours([], NOW))).toBeNull();
  });

  it("ignores stamps outside the window", () => {
    const hours = busiestHours([stamp("m1", "2026-09-01T12:00:00+02:00")], NOW, 14);
    expect(peakHour(hours)).toBeNull();
  });
});

describe("bestRegulars", () => {
  it("needs two visits and sorts by visit count", () => {
    const stamps = [
      stamp("m1", "2026-11-01T12:00:00+02:00"),
      stamp("m1", "2026-11-02T12:00:00+02:00"),
      stamp("m2", "2026-11-01T12:00:00+02:00"),
      stamp("m2", "2026-11-02T12:00:00+02:00"),
      stamp("m2", "2026-11-03T12:00:00+02:00"),
      stamp("m3", "2026-11-03T12:00:00+02:00"),
    ];
    const memberships = [
      member("m1", "2026-10-01T09:00:00+02:00"),
      member("m2", "2026-10-01T09:00:00+02:00"),
      member("m3", "2026-10-01T09:00:00+02:00"),
    ];
    const regulars = bestRegulars(stamps, memberships, NOW);
    expect(regulars.map((r) => [r.membershipId, r.visits])).toEqual([
      ["m2", 3],
      ["m1", 2],
    ]);
  });

  it("returns nobody when there are no guests yet", () => {
    expect(bestRegulars([], [], NOW)).toEqual([]);
  });
});

describe("attentionItems", () => {
  it("says nothing when nothing needs the owner", () => {
    expect(
      attentionItems({
        rewardsWaiting: 0,
        lapsedGuests: 0,
        lowCreditCents: 50000,
        unpublishedDrafts: 0,
      }),
    ).toEqual([]);
  });

  it("writes each item in plain words", () => {
    const items = attentionItems({
      rewardsWaiting: 1,
      lapsedGuests: 2,
      lowCreditCents: 500,
      unpublishedDrafts: 1,
    });
    expect(items.map((item) => item.key)).toEqual(["rewards", "lapsed", "credit", "drafts"]);
    expect(items[0]!.text).toBe("1 reward is waiting to be redeemed at the till.");
    expect(items[1]!.text).toBe("2 guests have not visited in 30 days.");
    expect(items[3]!.text).toBe("1 draft not published yet.");
  });
});

import {
  countUpTo,
  sameTimeChangeLabel,
  todayAgainstYesterday,
  type MembershipLike as MemberLike,
  type StampLike as StampRow,
} from "./home-metrics";

describe("countUpTo", () => {
  const start = new Date("2026-11-09T22:00:00Z");
  it("counts from the start up to the time, both ends included", () => {
    const times = ["2026-11-09T22:00:00Z", "2026-11-10T05:00:00Z", "2026-11-10T06:00:00Z", "2026-11-10T06:00:01Z"];
    expect(countUpTo(times, start, new Date("2026-11-10T06:00:00Z"))).toBe(3);
  });
  it("ignores items before the start", () => {
    expect(countUpTo(["2026-11-09T21:59:59Z"], start, new Date("2026-11-10T06:00:00Z"))).toBe(0);
  });
});

describe("sameTimeChangeLabel", () => {
  it("says nothing yet when both are zero", () => {
    expect(sameTimeChangeLabel(0, 0)).toBe("Nothing yet today");
  });
  it("never shows a percent for a zero base", () => {
    expect(sameTimeChangeLabel(4, 0)).toBe("More than yesterday so far");
  });
  it("shows signed percents against yesterday so far", () => {
    expect(sameTimeChangeLabel(112, 100)).toBe("+12% vs yesterday so far");
    expect(sameTimeChangeLabel(92, 100)).toBe("-8% vs yesterday so far");
    expect(sameTimeChangeLabel(5, 5)).toBe("+0% vs yesterday so far");
  });
  it("never goes below minus 100 percent", () => {
    expect(sameTimeChangeLabel(0, 7)).toBe("-100% vs yesterday so far");
  });
});

describe("todayAgainstYesterday", () => {
  const stamp = (membershipId: string, createdAt: string): StampRow => ({ membershipId, createdAt, status: "valid" });
  const member = (id: string, joinedAt: string): MemberLike => ({
    id,
    customerId: `c-${id}`,
    joinedAt,
    stampsCurrent: 0,
    lastVisitAt: null,
  });
  // Yesterday (9 Nov, SAST) was busy all day, including after 08:00.
  const stamps = [
    stamp("a", "2026-11-09T07:00:00Z"), // 09:00 yesterday
    stamp("b", "2026-11-09T10:00:00Z"), // 12:00 yesterday
    stamp("c", "2026-11-09T16:00:00Z"), // 18:00 yesterday
  ];
  const members = [member("a", "2026-11-09T07:00:00Z"), member("b", "2026-11-09T10:00:00Z")];

  it("morning with no visits yet and a busy yesterday is zero against zero so far", () => {
    const now = new Date("2026-11-10T06:00:00Z").getTime(); // 08:00 SAST
    const { today, yesterday } = todayAgainstYesterday(stamps, members, now);
    expect(today.visits).toBe(0);
    expect(yesterday.visits).toBe(0);
    expect(sameTimeChangeLabel(today.visits, yesterday.visits)).toBe("Nothing yet today");
  });

  it("an evening equal to yesterday at the same hour reads as no change", () => {
    const withToday = [
      ...stamps,
      stamp("a", "2026-11-10T07:00:00Z"),
      stamp("b", "2026-11-10T10:00:00Z"),
      stamp("c", "2026-11-10T16:00:00Z"),
    ];
    const now = new Date("2026-11-10T17:00:00Z").getTime(); // 19:00 SAST
    const { today, yesterday } = todayAgainstYesterday(withToday, members, now);
    expect(today.visits).toBe(3);
    expect(yesterday.visits).toBe(3);
    expect(today.unique).toBe(3);
    expect(yesterday.unique).toBe(3);
    expect(sameTimeChangeLabel(today.visits, yesterday.visits)).toBe("+0% vs yesterday so far");
  });

  it("midday: yesterday counts only what happened before the same clock time", () => {
    const now = new Date("2026-11-10T08:00:00Z").getTime(); // 10:00 SAST
    const { yesterday } = todayAgainstYesterday(stamps, members, now);
    expect(yesterday.visits).toBe(1);
    expect(yesterday.newMembers).toBe(1);
  });

  it("splits days at midnight in Johannesburg, not at midnight UTC", () => {
    const edge = [stamp("a", "2026-11-09T21:59:59Z"), stamp("b", "2026-11-09T22:00:00Z")];
    // One second into 10 Nov in Johannesburg: only the 22:00:00Z stamp is today.
    const after = todayAgainstYesterday(edge, [], new Date("2026-11-09T22:00:01Z").getTime());
    expect(after.today.visits).toBe(1);
    expect(after.yesterday.visits).toBe(0);
    // The last second of 9 Nov: only the 21:59:59Z stamp is today.
    const before = todayAgainstYesterday(edge, [], new Date("2026-11-09T21:59:59Z").getTime());
    expect(before.today.visits).toBe(1);
  });

  it("ignores undone stamps", () => {
    const undone: StampRow = { membershipId: "x", createdAt: "2026-11-10T05:00:00Z", status: "undone" };
    const now = new Date("2026-11-10T06:00:00Z").getTime();
    expect(todayAgainstYesterday([undone], [], now).today.visits).toBe(0);
  });
});
