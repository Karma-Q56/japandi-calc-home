import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { joinRestaurant, updateGuestProfile } from "@/domain/members";
import { awardBirthdayIfDue } from "@/domain/loyalty";
import { segmentMemberships, segmentLabel } from "@/domain/audiences";
import { listCustomers } from "@/domain/customers";
import { birthdayLabel, birthdayOf, isValidBirthday } from "@/lib/birthday";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT = "rest-daily-grind";
const OWNER = { role: "owner", restaurantId: RESTAURANT };

function membershipFor(restaurantId: string) {
  const state = demoRepo.read();
  return state.memberships.find((item) => item.restaurantId === restaurantId)!;
}

describe("day and month only", () => {
  it("keeps only the day and month a guest shares at join", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Thabo",
      phone: "+27 82 123 0001",
      marketingSms: true,
      source: "qr",
      birthday: { day: 6, month: 10 },
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const customer = demoRepo
      .read()
      .customers.find((item) => item.id === joined.data.customerId);
    expect(birthdayOf(customer)).toEqual({ day: 6, month: 10 });
    expect(JSON.stringify(customer?.birthday)).not.toContain("19");
  });

  it("leaves the birthday out when the guest skips it", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Anna",
      phone: "+27 82 123 0002",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const customer = demoRepo
      .read()
      .customers.find((item) => item.id === joined.data.customerId);
    expect(birthdayOf(customer)).toBeNull();
  });

  it("refuses a day that does not exist in the chosen month", () => {
    const result = joinRestaurant({
      slug: "daily-grind",
      name: "Zanele",
      phone: "+27 82 123 0003",
      marketingSms: true,
      source: "qr",
      birthday: { day: 31, month: 2 },
    });
    expect(result.ok).toBe(false);
    expect(isValidBirthday({ day: 29, month: 2 })).toBe(true);
    expect(isValidBirthday({ day: 31, month: 4 })).toBe(false);
  });

  it("reads a legacy full date string as day and month", () => {
    expect(birthdayOf({ birthday: "1994-06-12" })).toEqual({ month: 6, day: 12 });
    expect(birthdayLabel({ day: 12, month: 6 })).toBe("12 June");
  });
});

describe("guest settings", () => {
  it("saves a birthday the guest added later", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Bongi",
      phone: "+27 82 123 0004",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const saved = updateGuestProfile(joined.data.customerId, {
      name: "Bongi",
      birthday: { day: 2, month: 10 },
    });
    expect(saved.ok).toBe(true);
    const customer = demoRepo
      .read()
      .customers.find((item) => item.id === joined.data.customerId);
    expect(birthdayOf(customer)).toEqual({ day: 2, month: 10 });
  });

  it("clears the birthday when the guest removes the month", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Pieter",
      phone: "+27 82 123 0005",
      marketingSms: true,
      source: "qr",
      birthday: { day: 9, month: 10 },
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const saved = updateGuestProfile(joined.data.customerId, { name: "Pieter" });
    expect(saved.ok).toBe(true);
    const customer = demoRepo
      .read()
      .customers.find((item) => item.id === joined.data.customerId);
    expect(birthdayOf(customer)).toBeNull();
  });
});

describe("birthday reward trigger", () => {
  it("gives one bonus stamp in the birthday week, once a year", () => {
    const membership = membershipFor(RESTAURANT);
    const state = demoRepo.read();
    const customerId = membership.customerId;
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === customerId ? { ...item, birthday: { day: 2, month: 10 } } : item,
      ),
    }));
    // Seed time is 1 October 2026, Johannesburg time, so the birthday week is open.
    expect(awardBirthdayIfDue(membership.id)).toBe(1);
    expect(awardBirthdayIfDue(membership.id)).toBe(0);
    const stamps = demoRepo
      .read()
      .stamps.filter((stamp) => stamp.membershipId === membership.id && stamp.reason === "birthday");
    expect(stamps).toHaveLength(1);
  });

  it("does nothing outside the birthday week", () => {
    const membership = membershipFor(RESTAURANT);
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === membership.customerId ? { ...item, birthday: { day: 20, month: 10 } } : item,
      ),
    }));
    expect(awardBirthdayIfDue(membership.id)).toBe(0);
  });

  it("hands over the owner's free item instead of a stamp", () => {
    const membership = membershipFor("rest-sunrise-bakes");
    const sunrise = "rest-sunrise-bakes";
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === sunrise ? { ...item, birthdayRewardItem: "birthday cupcake", birthdayRewardKind: "freeItem" } : item,
      ),
      customers: current.customers.map((item) =>
        item.id === membership.customerId ? { ...item, birthday: { day: 2, month: 10 } } : item,
      ),
    }));
    expect(awardBirthdayIfDue(membership.id)).toBe(1);
    expect(awardBirthdayIfDue(membership.id)).toBe(0);
    const rewards = demoRepo
      .read()
      .rewards.filter((reward) => reward.membershipId === membership.id);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]!.description).toBe("Free birthday cupcake");
    expect(rewards[0]!.key).toBe("birthday-item:2026");
  });
});

describe("birthdays this month", () => {
  it("matches guests whose birthday falls in the current month", () => {
    const audience = { type: "birthday_month" } as const;
    const members = segmentMemberships(demoRepo.read(), RESTAURANT, audience);
    const state = demoRepo.read();
    for (const membership of members) {
      const customer = state.customers.find((item) => item.id === membership.customerId);
      expect(customer?.birthday).toBeTruthy();
      expect(birthdayOf(customer)!.month).toBe(10);
    }
    expect(segmentLabel(audience)).toBe("Birthdays this month");
  });

  it("filters the customers list to birthday guests this month", () => {
    const result = listCustomers({ restaurantId: RESTAURANT, filter: "birthdays", session: OWNER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = demoRepo.read();
    expect(result.data.total).toBeGreaterThan(0);
    for (const row of result.data.rows) {
      const membership = state.memberships.find((item) => item.id === row.membershipId)!;
      const customer = state.customers.find((item) => item.id === membership.customerId);
      expect(birthdayOf(customer)!.month).toBe(10);
    }
  });
});
