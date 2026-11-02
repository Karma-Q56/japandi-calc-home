import { describe, expect, it } from "vitest";
import { buildLiveOverview } from "@/lib/live-overview";

const NOW = new Date("2026-11-02T10:00:00+02:00").getTime();

function input(overrides: Partial<Parameters<typeof buildLiveOverview>[0]> = {}) {
  return {
    creditCents: 12500,
    memberships: ["m1", "m2", "m3"],
    stamps: [
      { membershipId: "m1", createdAt: "2026-11-02T08:00:00+02:00" },
      { membershipId: "m1", createdAt: "2026-11-01T09:00:00+02:00" },
      { membershipId: "m2", createdAt: "2026-10-20T09:00:00+02:00" },
    ],
    rewardsReady: 2,
    campaigns: [
      {
        id: "c1",
        name: "Friday treat",
        status: "sent",
        scheduledAt: null,
        sentAt: "2026-10-30T09:00:00+02:00",
        createdAt: "2026-10-29T09:00:00+02:00",
        delivered: 40,
        failed: 2,
      },
      {
        id: "c2",
        name: "Next week",
        status: "scheduled",
        scheduledAt: "2026-11-05T09:00:00+02:00",
        sentAt: null,
        createdAt: "2026-11-01T09:00:00+02:00",
        delivered: 0,
        failed: 0,
      },
    ],
    ...overrides,
  };
}

describe("live owner overview", () => {
  it("counts today, returning guests, rewards and credit", () => {
    const overview = buildLiveOverview(input(), NOW);
    const byKey = new Map(overview.stats.map((stat) => [stat.key, stat]));

    expect(byKey.get("today")?.value).toBe(1);
    expect(byKey.get("returning")?.value).toBe(1);
    expect(byKey.get("ready")?.value).toBe(2);
    expect(byKey.get("credit")?.display).toBe("R125.00");
    expect(byKey.get("campaign")?.value).toBe(1);
  });

  it("puts the eight weeks in oldest to newest order", () => {
    const overview = buildLiveOverview(input(), NOW);

    expect(overview.weeklyVisits).toHaveLength(8);
    expect(overview.weeklyVisits.at(-1)).toBe(2);
    expect(overview.weeklyVisits.at(-2)).toBe(1);
  });

  it("picks the last sent campaign and the next scheduled one", () => {
    const overview = buildLiveOverview(input(), NOW);

    expect(overview.lastCampaign).toMatchObject({
      id: "c1",
      delivered: 40,
      failed: 2,
    });
    expect(overview.nextCampaign).toMatchObject({
      id: "c2",
      statusLabel: "Scheduled",
    });
    expect(overview.nextCampaign?.when).not.toBeNull();
  });

  it("handles a restaurant with no activity", () => {
    const overview = buildLiveOverview(
      input({ memberships: [], stamps: [], campaigns: [], rewardsReady: 0 }),
      NOW,
    );

    expect(overview.stats.find((stat) => stat.key === "today")?.value).toBe(0);
    expect(overview.weeklyVisits.every((value) => value === 0)).toBe(true);
    expect(overview.lastCampaign).toBeNull();
    expect(overview.nextCampaign).toBeNull();
  });
});
