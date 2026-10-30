import { beforeEach, describe, expect, it } from "vitest";
import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { ownerInsights } from "@/domain/insights";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };

function insights() {
  const result = ownerInsights({
    restaurantId: "rest-daily-grind",
    session: OWNER,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("insights failed");
  return result.data;
}

describe("owner insights", () => {
  it("finds the busiest days from stamp times", () => {
    const data = insights();
    expect(data.busiestDays.length).toBeGreaterThan(0);
    const topDay = data.busiestDays[0];
    expect(topDay?.visits).toBeGreaterThanOrEqual(data.busiestDays[1]?.visits ?? 0);
    const still = [...data.quietDays];
    expect(still[0]?.visits).toBeLessThanOrEqual(topDay?.visits ?? 0);
  });

  it("groups visits into times of day", () => {
    const data = insights();
    expect(data.busiestTimes.length).toBeGreaterThan(0);
    expect(data.busiestTimes[0]?.visits).toBeGreaterThan(0);
  });

  it("points the top items at orders", () => {
    const data = insights();
    expect(data.topItems.length).toBeGreaterThan(0);
    expect(data.topItems[0]?.label).toBe("Flat white");
  });

  it("marks regulars who have gone quiet for far longer than their rhythm", () => {
    // Seed stamps are one per guest every couple of days, so craft one clear case:
    // five Tuesdays a week apart, then a five week silence with the clock 45 days on.
    const membership = demoRepo
      .read()
      .memberships.find((m) => m.restaurantId === "rest-daily-grind")!;
    const allStamps = demoRepo.read().stamps.filter((s) => s.membershipId !== membership.id);
    const crafted = [
      "2026-08-04T07:00:00.000Z",
      "2026-08-11T07:00:00.000Z",
      "2026-08-18T07:00:00.000Z",
      "2026-08-25T07:00:00.000Z",
      "2026-09-01T07:00:00.000Z",
    ].map((createdAt, index) => ({
      id: `insight-stamp-${index}`,
      restaurantId: "rest-daily-grind",
      membershipId: membership.id,
      staffId: null,
      key: `quiet-${index}`,
      createdAt,
      status: "valid" as const,
    }));
    updateDemo((current) => ({ ...current, stamps: [...allStamps, ...crafted] }));
    clock.advance(Date.UTC(2026, 9, 20, 8) - Date.UTC(2026, 9, 1, 8));
    const data = insights();
    const row = data.slippingRegulars.find((entry) => entry.membershipId === membership.id);
    expect(row).toBeTruthy();
    expect(row!.detail).toContain("days since the last visit");
  });

  it("lists birthdays coming up within the month and new guests this week", () => {
    const data = insights();
    expect(data.birthdaysUpcoming.length).toBeGreaterThan(0);
    const oldest = data.birthdaysUpcoming[data.birthdaysUpcoming.length - 1];
    expect(oldest?.inDays).toBeGreaterThanOrEqual(0);
    expect(data.newGuests.length).toBe(0);
    expect(data.newGuests.every((row) => row.name.length > 0)).toBe(true);
  });

  it("keeps other restaurants out", () => {
    const result = ownerInsights({
      restaurantId: "rest-oak-table",
      session: OWNER,
    });
    expect(result.ok).toBe(false);
  });
});
