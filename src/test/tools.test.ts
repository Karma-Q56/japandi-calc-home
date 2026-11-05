import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { recordStamp } from "@/domain/stamps";
import {
  evaluateToolsAfterVisit,
  guestToolsView,
  johannesburgDateParts,
  johannesburgWeekday,
  saveTools,
  streakRun,
  toolBudgetFor,
  weekdayLabel,
} from "@/domain/tools";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
  // Seeded visits are spread around the reset time, so start the clock after the latest one.
  const latest = Math.max(...demoRepo.read().stamps.map((s) => Date.parse(s.createdAt)));
  if (latest >= clock.now()) clock.advance(latest - clock.now() + 24 * 60 * 60 * 1000);
});

const RESTAURANT = "rest-daily-grind";
const OWNER = { role: "owner", restaurantId: RESTAURANT };
const DAY = 24 * 60 * 60 * 1000;

function nextJohannesburgWeekday(weekday: number) {
  const state = demoRepo.read();
  const at = new Date(state.now);
  at.setUTCHours(6, 0, 0, 0);
  while (johannesburgWeekday(at.getTime()) !== weekday || at.getTime() <= state.now) {
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return at.getTime();
}

function membershipFor(restaurantId: string) {
  const state = demoRepo.read();
  return state.memberships.find((item) => item.restaurantId === restaurantId)!;
}

function bonusStamps(membershipId: string) {
  return demoRepo
    .read()
    .stamps.filter(
      (stamp) =>
        stamp.membershipId === membershipId &&
        stamp.reason === "bonus" &&
        stamp.status === "valid",
    );
}

function stampVisit(membershipId: string, key: string) {
  // Walk past the visit window before the next visit, so the stamp lands.
  clock.advance(5 * 60 * 60 * 1000);
  const result = recordStamp({
    restaurantId: RESTAURANT,
    membershipId,
    staffId: "staff-1",
    key,
    session: OWNER,
  });
  expect(result.ok).toBe(true);
  return result;
}

describe("double stamp day", () => {
  it("earns one extra stamp on the chosen weekday, and again on the next visit that day", () => {
    const membership = membershipFor(RESTAURANT);
    const weekday = johannesburgWeekday(clock.now() + 5 * 60 * 60 * 1000);
    ensureTools({ doubleStamp: true, weekday });
    stampVisit(membership.id, "v1");
    clock.advance(10 * 60 * 1000 + 1);
    stampVisit(membership.id, "v2");
    const bonus = bonusStamps(membership.id);
    expect(bonus).toHaveLength(2);
    expect(bonus.every((stamp) => stamp.key?.startsWith("double:"))).toBe(true);
  });

  it("gives nothing on other weekdays", () => {
    const membership = membershipFor(RESTAURANT);
    const visitWeekday = johannesburgWeekday(clock.now() + 5 * 60 * 60 * 1000);
    ensureTools({ doubleStamp: true, weekday: (visitWeekday + 1) % 7 });
    stampVisit(membership.id, "v3");
    expect(bonusStamps(membership.id)).toHaveLength(0);
  });

  it("does nothing while the tool is off", () => {
    const membership = membershipFor(RESTAURANT);
    stampVisit(membership.id, "v4");
    expect(bonusStamps(membership.id)).toHaveLength(0);
  });
});

describe("Johannesburg calendar", () => {
  it("uses Johannesburg time, not UTC, for the weekday", () => {
    // 22:30 UTC on 1 October 2026 is already Friday in Johannesburg.
    expect(johannesburgWeekday(Date.UTC(2026, 9, 1, 22, 30))).toBe(5);
    expect(weekdayLabel(4)).toBe("Thursday");
  });
});

describe("visit streak", () => {
  it("pays out at the end of a run, once per run length", () => {
    const membership = membershipFor(RESTAURANT);
    ensureTools({ streak: true });
    // Two Johannesburg weeks back to back: a Tuesday then Wednesday in each.
    // The timeline starts after the seed data's latest visit so no stamp is
    // blocked by the too soon window.
    demoRepo.update((current) => ({ ...current, now: nextJohannesburgWeekday(2) }));
    stampVisit(membership.id, "s1"); // Johannesburg Tuesday, week 1, visit 1
    clock.advance(DAY);
    stampVisit(membership.id, "s2"); // Wednesday, week 1 now meets the bar, run is 1
    clock.advance(6 * DAY);
    stampVisit(membership.id, "s3"); // Johannesburg Tuesday of week 2, run stays 1
    clock.advance(DAY);
    stampVisit(membership.id, "s4"); // Wednesday, week 2 completes the run, pays out
    expect(streakRun(demoRepo.read(), membership.id, { enabled: true, weeks: 2, weeklyVisits: 2, bonusStamps: 1 })).toBe(2);
    expect(bonusStamps(membership.id).filter((stamp) => stamp.key?.startsWith("streak:"))).toHaveLength(1);
    // A further visit in the same run never pays twice for the same milestone.
    clock.advance(6 * 60 * 60 * 1000);
    stampVisit(membership.id, "s5");
    expect(bonusStamps(membership.id).filter((stamp) => stamp.key?.startsWith("streak:"))).toHaveLength(1);
  });
});

describe("monthly tool budget", () => {
  it("stops granting once the cap is reached, and blocks the other tool too", () => {
    const membership = membershipFor(RESTAURANT);
    const visitWeekday = johannesburgWeekday(clock.now() + 5 * 60 * 60 * 1000);
    ensureTools({ doubleStamp: true, weekday: visitWeekday, streak: true, weeklyVisits: 1, budget: 1 });
    stampVisit(membership.id, "b1"); // double stamp, budget spent
    expect(toolBudgetFor(RESTAURANT)).toEqual({ cap: 1, used: 1 });
    clock.advance(10 * 60 * 1000 + 1);
    stampVisit(membership.id, "b2"); // would double stamp and reach a streak milestone, blocked
    // Seed one earlier week so the current visits complete a 2 week run with
    // one visit a week. The streak milestone would pay out, but only the
    // budget is left at zero, so nothing new may be granted.
    const priorVisit = new Date(demoRepo.read().now - 7 * DAY);
    priorVisit.setUTCHours(6, 0, 0, 0);
    demoRepo.update((current) => ({
      ...current,
      stamps: [
        ...current.stamps,
        {
          id: "stamp-seed-week",
          restaurantId: RESTAURANT,
          membershipId: membership.id,
          staffId: null,
          key: "seed-week-1",
          createdAt: priorVisit.toISOString(),
          status: "valid" as const,
          reason: "visit" as const,
        },
      ],
    }));
    const visit = demoRepo.read().stamps.find((stamp) => stamp.key === "b2")!;
    expect(evaluateToolsAfterVisit(membership.id, visit.id)).toBe(0);
    expect(streakRun(demoRepo.read(), membership.id, { enabled: true, weeks: 2, weeklyVisits: 1, bonusStamps: 1 })).toBe(2);
    expect(bonusStamps(membership.id)).toHaveLength(1);
    expect(toolBudgetFor(RESTAURANT).used).toBe(1);
  });

  it("resets in the next Johannesburg month", () => {
    const membership = membershipFor(RESTAURANT);
    const visitWeekday = johannesburgWeekday(clock.now() + 5 * 60 * 60 * 1000);
    ensureTools({ doubleStamp: true, weekday: visitWeekday, budget: 1 });
    stampVisit(membership.id, "m1");
    expect(toolBudgetFor(RESTAURANT).used).toBe(1);
    const today = johannesburgDateParts(demoRepo.read().now);
    demoRepo.update((current) => ({
      ...current,
      now: Date.UTC(today.year, today.month, 1, 8),
    }));
    expect(toolBudgetFor(RESTAURANT).used).toBe(0);
  });
});

describe("saveTools validation", () => {
  it("refuses a budget with no digits or an impossible run length", () => {
    expect(
      saveTools({ restaurantId: RESTAURANT, doubleStamp: { enabled: true, weekday: 4 }, streak: { enabled: false, weeks: 2, weeklyVisits: 2, bonusStamps: 1 }, toolStampBudget: 0 }).ok,
    ).toBe(false);
    expect(
      saveTools({ restaurantId: RESTAURANT, doubleStamp: { enabled: false, weekday: 4 }, streak: { enabled: true, weeks: 1, weeklyVisits: 2, bonusStamps: 1 }, toolStampBudget: 100 }).ok,
    ).toBe(false);
    expect(
      saveTools({ restaurantId: RESTAURANT, doubleStamp: { enabled: false, weekday: 9 }, streak: { enabled: false, weeks: 2, weeklyVisits: 2, bonusStamps: 1 }, toolStampBudget: 100 }).ok,
    ).toBe(false);
  });

  it("saves a working configuration", () => {
    const result = saveTools({
      restaurantId: RESTAURANT,
      doubleStamp: { enabled: true, weekday: 2 },
      streak: { enabled: true, weeks: 3, weeklyVisits: 2, bonusStamps: 2 },
      toolStampBudget: 150,
    });
    expect(result.ok).toBe(true);
    const restaurant = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    expect(restaurant.doubleStamp).toEqual({ enabled: true, weekday: 2 });
    expect(restaurant.streak).toEqual({ enabled: true, weeks: 3, weeklyVisits: 2, bonusStamps: 2 });
    expect(restaurant.toolStampBudget).toBe(150);
  });
});

describe("guest view", () => {
  it("shows the weekday line and run progress without guessing anything about the guest", () => {
    const membership = membershipFor(RESTAURANT);
    ensureTools({ doubleStamp: true, weekday: 4, streak: true });
    const view = guestToolsView(demoRepo.read(), membership);
    expect(view.doubleDayLine).toBe(
      "Double stamp day: every Thursday. A visit that day earns one extra stamp.",
    );
    expect(view.streak).toMatchObject({ run: 0, weeks: 2, weeklyVisits: 2 });
    expect(typeof view.streak?.visitsThisWeek).toBe("number");
  });

  it("stays empty while both tools are off", () => {
    const membership = membershipFor(RESTAURANT);
    const view = guestToolsView(demoRepo.read(), membership);
    expect(view.doubleDayLine).toBeNull();
    expect(view.streak).toBeNull();
  });
});

function ensureTools(options: {
  doubleStamp?: boolean;
  weekday?: number;
  streak?: boolean;
  weeklyVisits?: number;
  budget?: number;
}) {
  const {
    doubleStamp = false,
    weekday = 4,
    streak = false,
    weeklyVisits = 2,
    budget = 100,
  } = options;
  const saved = saveTools({
    restaurantId: RESTAURANT,
    doubleStamp: { enabled: doubleStamp, weekday },
    streak: { enabled: streak, weeks: 2, weeklyVisits, bonusStamps: 1 },
    toolStampBudget: budget,
  });
  expect(saved.ok).toBe(true);
}
