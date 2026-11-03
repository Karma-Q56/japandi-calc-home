import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { joinRestaurant } from "@/domain/members";
import { recordOrder } from "@/domain/orders";
import { knowYourGuest } from "@/domain/customers";
import { averageGapPhrase, countLabel } from "@/lib/wording";

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };

beforeEach(() => {
  demoRepo.reset();
});

describe("countLabel", () => {
  it("uses the singular only for exactly one", () => {
    expect(countLabel(1, "stamp")).toBe("1 stamp");
    expect(countLabel(0, "stamp")).toBe("0 stamps");
    expect(countLabel(2, "stamp")).toBe("2 stamps");
    expect(countLabel(1, "day")).toBe("1 day");
    expect(countLabel(7, "day")).toBe("7 days");
    expect(countLabel(1, "time", "times")).toBe("1 time");
    expect(countLabel(3, "time", "times")).toBe("3 times");
    expect(countLabel(1, "guest")).toBe("1 guest");
    expect(countLabel(15, "guest")).toBe("15 guests");
  });
});

describe("averageGapPhrase", () => {
  it("rounds to whole numbers and uses plain words", () => {
    expect(averageGapPhrase(36.5)).toBe("about every 5 weeks");
    expect(averageGapPhrase(14)).toBe("about every 2 weeks");
    expect(averageGapPhrase(5.4)).toBe("about every 5 days");
    expect(averageGapPhrase(1)).toBe("about every day");
    expect(averageGapPhrase(0.2)).toBe("about every day");
  });

  it("never prints a decimal", () => {
    for (const days of [2.5, 9.9, 20.1, 36.5, 49.4]) {
      expect(averageGapPhrase(days)).not.toMatch(/\./);
    }
  });
});

describe("know your guest wording", () => {
  it("uses the first name or 'they' and singular stamp wording", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Thandi Mokoena",
      phone: "+27 82 124 1001",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    updateDemo((current) => ({
      ...current,
      stamps: current.stamps.concat({
        id: "wording-stamp-0",
        restaurantId: "rest-daily-grind",
        membershipId: joined.data.membershipId,
        staffId: null,
        key: "wording-0",
        createdAt: "2026-09-01T08:00:00.000Z",
        status: "valid" as const,
      }),
    }));
    recordOrder({
      restaurantId: "rest-daily-grind",
      membershipId: joined.data.membershipId,
      lines: [{ label: "Flat white", qty: 1 }],
      session: OWNER,
    });
    const know = knowYourGuest({
      membershipId: joined.data.membershipId,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    const text = JSON.stringify(know.data);
    expect(text).toMatch(/They have \d+ stamps? on their card/);
    expect(text).not.toMatch(/\b1 stamps\b/);
    expect(text.match(/Thandi/g)).toHaveLength(1);
    expect(countLabel(1, "stamp")).toBe("1 stamp");
  });

  it("never uses gendered pronouns in generated guest text", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "James Venter",
      phone: "+27 82 124 1002",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === joined.data.customerId ? { ...item, birthday: { day: 12, month: 3 } } : item,
      ),
    }));
    recordOrder({
      restaurantId: "rest-daily-grind",
      membershipId: joined.data.membershipId,
      lines: [{ label: "Flat white", qty: 1 }],
      session: OWNER,
    });
    const know = knowYourGuest({
      membershipId: joined.data.membershipId,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    const text = JSON.stringify(know.data);
    expect(text).toMatch(/James .*usually has a flat white/);
    expect(text.match(/James/g)).toHaveLength(1);
    expect(text).not.toMatch(/\b(she|he|her|hers|his|him|himself|herself)\b/i);
  });
});
