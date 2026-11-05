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
