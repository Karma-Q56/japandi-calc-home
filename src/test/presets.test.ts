import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { toolBudgetFor } from "@/domain/tools";
import {
  MISS_YOU_COOLDOWN_DAYS,
  giveCustomReward,
  issueMissYouFor,
  presetCosts,
  runMissYou,
  whatHappensWhen,
} from "@/domain/presets";
import type { Restaurant } from "@/data/types";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT = "rest-daily-grind";
const DAY = 86400000;

function membershipsFor(restaurantId: string) {
  return demoRepo.read().memberships.filter((item) => item.restaurantId === restaurantId);
}

function enableMissYou(config: Partial<NonNullable<Restaurant["missYou"]>> = {}) {
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((item) =>
      item.id === RESTAURANT
        ? {
            ...item,
            missYou: { enabled: true, afterDays: 30, kind: "stamp", item: "", ...config },
            toolStampBudget: 10000,
          }
        : item,
    ),
  }));
}

function ageMember(membershipId: string, daysWithoutVisit: number) {
  const lastMs = demoRepo.read().now - daysWithoutVisit * DAY;
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.id === membershipId ? { ...item, lastVisitAt: new Date(lastMs).toISOString() } : item,
    ),
  }));
}

function missYouStampsFor(membershipId: string) {
  return demoRepo
    .read()
    .stamps.filter((stamp) => stamp.membershipId === membershipId && stamp.reason === "missyou");
}

describe("we miss you rule", () => {
  it("grants one bonus stamp when the guest has been away long enough", () => {
    enableMissYou();
    const members = membershipsFor(RESTAURANT);
    const guest = members[0]!;
    ageMember(guest.id, 45);
    const first = issueMissYouFor(RESTAURANT, guest.id);
    expect(first).toEqual({ granted: 1, reason: "ok" });
    expect(missYouStampsFor(guest.id).length).toBe(1);
  });

  it("stays quiet while the recent visit is inside the after-days window", () => {
    enableMissYou({ afterDays: 30 });
    const guest = membershipsFor(RESTAURANT)[0]!;
    ageMember(guest.id, 7);
    const result = issueMissYouFor(RESTAURANT, guest.id);
    expect(result.reason).toBe("not-long-enough");
    expect(missYouStampsFor(guest.id).length).toBe(0);
  });

  it("does not treat the same guest twice inside 60 days", () => {
    enableMissYou();
    const guest = membershipsFor(RESTAURANT)[0]!;
    ageMember(guest.id, 45);
    expect(issueMissYouFor(RESTAURANT, guest.id).reason).toBe("ok");
    // A second attempt the same month, and again after a few weeks.
    ageMember(guest.id, 45);
    const retry = issueMissYouFor(RESTAURANT, guest.id);
    expect(retry.reason).toBe("cooldown");
    expect(missYouStampsFor(guest.id).length).toBe(1);
    // After the cooldown the guest can qualify again.
    const later = demoRepo.read().now + (MISS_YOU_COOLDOWN_DAYS + 1) * DAY;
    updateDemo((current) => ({ ...current, now: later }));
    ageMember(guest.id, 70);
    expect(issueMissYouFor(RESTAURANT, guest.id).reason).toBe("ok");
    expect(missYouStampsFor(guest.id).length).toBe(2);
  });

  it("stops when the monthly bonus budget is used up", () => {
    enableMissYou();
    const [guestA, guestB] = membershipsFor(RESTAURANT);
    const used = toolBudgetFor(RESTAURANT).used;
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === RESTAURANT ? { ...item, toolStampBudget: used + 1 } : item,
      ),
    }));
    ageMember(guestA!.id, 45);
    ageMember(guestB!.id, 45);
    expect(issueMissYouFor(RESTAURANT, guestA!.id).reason).toBe("ok");
    const blocked = issueMissYouFor(RESTAURANT, guestB!.id);
    expect(blocked.reason).toBe("budget");
    expect(blocked.granted).toBe(0);
  });

  it("does nothing when the rule is switched off", () => {
    enableMissYou({ enabled: false });
    const guest = membershipsFor(RESTAURANT)[0]!;
    ageMember(guest.id, 60);
    const off = issueMissYouFor(RESTAURANT, guest.id);
    expect(off.reason).toBe("off");
    const runResult = runMissYou(RESTAURANT);
    expect(runResult.enabled).toBe(false);
  });

  it("gives a single-use personal offer for the free item kind and never twice", () => {
    enableMissYou({ kind: "freeItem", item: "a small chips" });
    const guest = membershipsFor(RESTAURANT)[0]!;
    ageMember(guest.id, 45);
    const first = issueMissYouFor(RESTAURANT, guest.id);
    expect(first.reason).toBe("ok");
    const state = demoRepo.read();
    const offer = state.specials.find((special) =>
      special.title.startsWith("We miss you") && special.restaurantId === RESTAURANT,
    );
    expect(offer).toBeDefined();
    const codes = state.specialCodes.filter(
      (code) => code.specialId === offer!.id && code.membershipId === guest.id,
    );
    expect(codes.length).toBe(1);
    // Second attempt is blocked by the shared cooldown, even after switching kind.
    enableMissYou({ kind: "stamp" });
    ageMember(guest.id, 45);
    expect(issueMissYouFor(RESTAURANT, guest.id).reason).toBe("cooldown");
    expect(missYouStampsFor(guest.id).length).toBe(0);
  });

  it("runs for every eligible guest at once and reports the skip for the budget", () => {
    enableMissYou();
    const members = membershipsFor(RESTAURANT);
    const used = toolBudgetFor(RESTAURANT).used;
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === RESTAURANT ? { ...item, toolStampBudget: used + 1 } : item,
      ),
    }));
    members.forEach((member, index) => ageMember(member.id, 40 + index));
    const result = runMissYou(RESTAURANT);
    expect(result.enabled).toBe(true);
    if (members.length > 1) {
      expect(result.treated).toBe(1);
      expect(result.stamps).toBe(1);
      expect(result.skippedBudget).toBe(members.length - 1);
    }
  });
});

describe("custom hand-out reward", () => {
  it("issues a personal offer with the owner-chosen name", () => {
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === RESTAURANT
          ? {
              ...item,
              customReward: { enabled: true, name: "Cookie on us", limitPerGuestPerMonth: 2 },
            }
          : item,
      ),
    }));
    const guest = membershipsFor(RESTAURANT)[0]!;
    const first = giveCustomReward({ restaurantId: RESTAURANT, membershipId: guest.id });
    expect(first.ok).toBe(true);
    const state = demoRepo.read();
    const codes = state.specialCodes.filter((code) => code.membershipId === guest.id);
    expect(codes.length).toBe(1);
  });

  it("respects the per-guest monthly limit", () => {
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === RESTAURANT
          ? {
              ...item,
              customReward: { enabled: true, name: "Cookie on us", limitPerGuestPerMonth: 1 },
            }
          : item,
      ),
    }));
    const guest = membershipsFor(RESTAURANT)[0]!;
    expect(giveCustomReward({ restaurantId: RESTAURANT, membershipId: guest.id }).ok).toBe(true);
    const second = giveCustomReward({ restaurantId: RESTAURANT, membershipId: guest.id });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("limit");
    // Next calendar month the count starts again.
    const nextMonth = demoRepo.read().now + 31 * DAY;
    updateDemo((current) => ({ ...current, now: nextMonth }));
    const third = giveCustomReward({ restaurantId: RESTAURANT, membershipId: guest.id });
    expect(third.ok).toBe(true);
  });

  it("does nothing while switched off", () => {
    const guest = membershipsFor(RESTAURANT)[0]!;
    const result = giveCustomReward({ restaurantId: RESTAURANT, membershipId: guest.id });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("off");
  });
});

describe("preset helpers", () => {
  it("lists the plain when-rules for every switched-on rule in firing order", () => {
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((item) =>
        item.id === RESTAURANT
          ? {
              ...item,
              welcomeStamps: 1,
              mysteryEveryVisits: 5,
              missYou: { enabled: true, afterDays: 30, kind: "stamp", item: "" },
            }
          : item,
      ),
    }));
    const restaurant = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    const lines = whatHappensWhen(restaurant);
    expect(lines[0]).toContain("Each visit adds a stamp");
    expect(lines).toContain("When someone joins: 1 welcome stamp.");
    expect(lines).toContain("Every 5th visit: a bonus stamp.");
    expect(lines.some((line) => line.startsWith("If we have not seen them for 30 days"))).toBe(
      true,
    );
  });

  it("gives a cost line per preset from demo data", () => {
    enableMissYou();
    const costs = presetCosts(RESTAURANT);
    const ids = costs.map((cost) => cost.id);
    expect(ids).toEqual([
      "collect",
      "every-nth",
      "join",
      "birthday",
      "miss-you",
      "quiet-day",
      "streak",
      "custom",
    ]);
    const missYou = costs.find((cost) => cost.id === "miss-you")!;
    expect(missYou.note).toContain("30 days");
    expect(missYou.guests).toBeGreaterThanOrEqual(0);
  });
});
