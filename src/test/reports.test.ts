import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { ownerReport, reportCsv } from "@/domain/reports";
import type { DemoState, StampEvent } from "@/data/types";

const DAY = 86400000;
const NOW = Date.parse("2026-10-31T12:00:00+02:00");

function stamp(id: string, membershipId: string, at: number, restaurantId: string): StampEvent {
  return {
    id,
    restaurantId,
    membershipId,
    staffId: null,
    key: null,
    createdAt: new Date(at).toISOString(),
    status: "valid",
  };
}

function setup(): {
  state: DemoState;
  restaurantId: string;
  membershipIds: string[];
  avg: number;
} {
  demoRepo.reset();
  const seed = demoRepo.read();
  const restaurantId = seed.restaurants[0]!.id;
  const memberships = seed.memberships.filter((item) => item.restaurantId === restaurantId);
  const membershipIds = memberships.slice(0, 2).map((item) => item.id);
  const sectionIds = new Set(seed.restaurants[0]!.menuSectionIds);
  const prices = seed.items
    .filter(
      (item) =>
        item.restaurantId === restaurantId &&
        item.available &&
        item.priceCents > 0 &&
        sectionIds.has(item.sectionId),
    )
    .map((item) => item.priceCents);
  const avg = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  let state!: DemoState;
  updateDemo((current) => {
    state = {
      ...current,
      now: NOW,
      stamps: [
        stamp("s-a1", membershipIds[0]!, NOW - 1 * DAY, restaurantId),
        stamp("s-a2", membershipIds[0]!, NOW - 2 * DAY, restaurantId),
        stamp("s-b1", membershipIds[1]!, NOW - 1 * DAY, restaurantId),
        stamp("s-b2", membershipIds[1]!, NOW - 3 * DAY, restaurantId),
        stamp("s-c1", membershipIds[0]!, NOW - 10 * DAY, restaurantId),
        stamp("s-d1", membershipIds[1]!, NOW - 9 * DAY, restaurantId),
      ],
      orders: [],
      redemptions: [],
      campaigns: [],
      messages: [],
      restaurants: current.restaurants.map((item) =>
        item.id === restaurantId ? { ...item, plan: "managed" as const } : item,
      ),
      memberships: current.memberships.map((item, index) => {
        if (item.restaurantId !== restaurantId) return item;
        return index === 0
          ? { ...item, joinedAt: new Date(NOW - 2 * DAY).toISOString() }
          : { ...item, joinedAt: new Date(NOW - 90 * DAY).toISOString() };
      }),
    };
    return state;
  });
  return { state, restaurantId, membershipIds, avg };
}

const session = (restaurantId: string) => ({ role: "owner", restaurantId });

beforeEach(() => {
  demoRepo.reset();
});

describe("owner reports", () => {
  it("counts visits, unique guests and return rate against the previous period", () => {
    const { restaurantId } = setup();
    const result = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data;
    expect(report.visits).toBe(4);
    expect(report.previousVisits).toBe(2);
    expect(report.uniqueGuests).toBe(2);
    expect(report.previousUniqueGuests).toBe(2);
    expect(report.returningGuests).toBe(2);
    expect(report.returnRate).toBe(100);
    expect(report.previousReturnRate).toBe(0);
    expect(report.newMembers).toBe(1);
    expect(report.previousNewMembers).toBe(0);
    expect(report.series).toHaveLength(7);
    expect(report.series.reduce((sum, point) => sum + point.visits, 0)).toBe(4);
  });

  it("says whether sales came from till bills or the menu average", () => {
    const { restaurantId, membershipIds, avg } = setup();
    const menuOnly = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(menuOnly.ok).toBe(true);
    if (!menuOnly.ok) return;
    expect(menuOnly.data.salesBasis).toBe("menu");
    expect(menuOnly.data.estimatedSalesCents).toBe(4 * avg);
    expect(menuOnly.data.notes[0]).toMatch(/average menu price/);

    updateDemo((current) => ({
      ...current,
      orders: [
        {
          id: "o-1",
          restaurantId,
          membershipId: membershipIds[0]!,
          stampId: "s-a1",
          source: "till",
          items: [{ label: "Flat white", qty: 1, kind: "item" }],
          billCents: 10000,
          createdAt: new Date(NOW - 1 * DAY).toISOString(),
        },
      ],
    }));
    const mixed = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(mixed.data.salesBasis).toBe("mixed");
    expect(mixed.data.billedVisits).toBe(1);
    expect(mixed.data.estimatedSalesCents).toBe(10000 + 3 * avg);

    updateDemo((current) => ({
      ...current,
      orders: current.stamps
        .filter((entry) => ["s-a1", "s-a2", "s-b1", "s-b2"].includes(entry.id))
        .map((entry, index) => ({
          id: `o-${index}`,
          restaurantId,
          membershipId: entry.membershipId,
          stampId: entry.id,
          source: "till" as const,
          items: [{ label: "Flat white", qty: 1, kind: "item" as const }],
          billCents: 5000,
          createdAt: entry.createdAt,
        })),
    }));
    const bills = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(bills.ok).toBe(true);
    if (!bills.ok) return;
    expect(bills.data.salesBasis).toBe("bills");
    expect(bills.data.estimatedSalesCents).toBe(20000);
  });

  it("prices discounts and campaign visits, then compares them with the plan fee", () => {
    const { restaurantId, membershipIds, avg } = setup();
    updateDemo((current) => ({
      ...current,
      redemptions: [
        {
          id: "r-1",
          restaurantId,
          membershipId: membershipIds[0]!,
          rewardId: "campaign-1",
          redeemedAt: new Date(NOW - 1 * DAY).toISOString(),
          kind: "campaign",
        },
        {
          id: "r-2",
          restaurantId,
          membershipId: membershipIds[1]!,
          rewardId: "campaign-1",
          redeemedAt: new Date(NOW - 1 * DAY).toISOString(),
          kind: "campaign",
        },
      ],
      campaigns: [
        {
          id: "campaign-1",
          restaurantId,
          name: "Tuesday treat",
          body: "A coffee on us",
          channel: "sms",
          audience: { type: "everyone" },
          code: "TUE01",
          status: "sent",
          requiresApproval: false,
          sentAt: new Date(NOW - 3 * DAY).toISOString(),
          recipients: 2,
          delivered: 2,
          failed: 0,
          actualCostCents: 70,
          createdBy: "owner",
          createdAt: new Date(NOW - 4 * DAY).toISOString(),
        },
      ],
      messages: [
        {
          id: "m-1",
          restaurantId,
          customerId: "customer-1",
          membershipId: membershipIds[0]!,
          campaignId: "campaign-1",
          channel: "sms",
          body: "A coffee on us",
          segments: 1,
          costCents: 35,
          status: "delivered",
          attempts: 1,
          createdAt: new Date(NOW - 3 * DAY).toISOString(),
          sentAt: new Date(NOW - 3 * DAY).toISOString(),
        },
        {
          id: "m-2",
          restaurantId,
          customerId: "customer-2",
          membershipId: membershipIds[1]!,
          campaignId: "campaign-1",
          channel: "sms",
          body: "A coffee on us",
          segments: 1,
          costCents: 35,
          status: "delivered",
          attempts: 1,
          createdAt: new Date(NOW - 3 * DAY).toISOString(),
          sentAt: new Date(NOW - 3 * DAY).toISOString(),
        },
      ],
    }));

    const result = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data;
    expect(report.discountCount).toBe(2);
    expect(report.discountCents).toBe(2 * avg);
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]!.delivered).toBe(2);
    // The two guests visited after the send, so both count as attributed.
    expect(report.campaigns[0]!.visited).toBe(2);
    expect(report.worth.additionalVisits).toBeGreaterThanOrEqual(2);
    expect(report.worth.planFeeCents).toBe(120000);
    expect(report.worth.smsCostCents).toBe(70);
    expect(report.worth.netCents).toBe(
      report.worth.valueCents - 120000 - 70,
    );
  });

  it("exports a CSV with the daily series and the summary", () => {
    const { restaurantId } = setup();
    const result = ownerReport({ restaurantId, days: 7, session: session(restaurantId) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const csv = reportCsv(result.data, "The Daily Grind");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Restaurant,The Daily Grind");
    expect(csv).toContain("Date,Visits,Previous period visits");
    expect(csv).toContain("Return rate percent,100");
    expect(csv.trim().split("\n")).toHaveLength(lines.length);
  });
});
