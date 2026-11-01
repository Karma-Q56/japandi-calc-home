/**
 * Loyalty tools researched from restaurant and cafe programs: a double stamp
 * day to pull guests onto quieter weekdays, a visit streak that rewards a
 * habit, and one shared monthly budget that caps the bonus stamps both tools
 * can hand out. Double stamp days never stack with another multiplier, and a
 * streak grant is idempotent, so retries never give the same guest two bonuses
 * for one run.
 */
import { demoRepo, updateDemo } from "@/data/repo";
import type { Restaurant, StreakConfig } from "@/data/types";
import { failure, success } from "./demo";
import { grantStampEvents } from "./grants";

const DAY = 86400000;
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS[((Math.floor(weekday) % 7) + 7) % 7] ?? "Tuesday";
}

/** Johannesburg calendar date for a moment (the city keeps UTC+2 all year). */
function johannesburgDateParts(atMs: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(atMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "");
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Day of week (0 = Sunday) of the Johannesburg calendar date. */
export function johannesburgWeekday(atMs: number): number {
  const { year, month, day } = johannesburgDateParts(atMs);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Monday-based index of the Johannesburg calendar week, stable forever. */
export function johannesburgWeekIndex(atMs: number): number {
  const { year, month, day } = johannesburgDateParts(atMs);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return Math.floor(Date.UTC(year, month - 1, day - ((weekday + 6) % 7)) / DAY);
}

function visitsInWeek(
  state: ReturnType<typeof demoRepo.read>,
  membershipId: string,
  weekIndex: number,
): number {
  return state.stamps.filter(
    (stamp) =>
      stamp.membershipId === membershipId &&
      stamp.status === "valid" &&
      (stamp.reason ?? "visit") === "visit" &&
      johannesburgWeekIndex(Date.parse(stamp.createdAt)) === weekIndex,
  ).length;
}

/** Consecutive weeks (ending now) with at least weeklyVisits recorded visits. */
export function streakRun(
  state: ReturnType<typeof demoRepo.read>,
  membershipId: string,
  config: StreakConfig,
): number {
  const current = johannesburgWeekIndex(state.now);
  // A week only enters the run once it meets the bar. Before that it counts as
  // in progress, so a guest mid-week keeps the run they earned before.
  const start =
    visitsInWeek(state, membershipId, current) >= config.weeklyVisits
      ? current
      : current - 1;
  let run = 0;
  let week = start;
  while (visitsInWeek(state, membershipId, week) >= config.weeklyVisits) {
    run++;
    week -= 7; // One step back is one Johannesburg calendar week.
  }
  return run;
}

/** What the month budget has spent and how much is left for the rest of the month. */
export function toolBudgetStatus(
  state: ReturnType<typeof demoRepo.read>,
  restaurantId: string,
): { cap: number | null; used: number } {
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const cap = restaurant?.toolStampBudget ?? 0;
  if (!Number.isInteger(cap) || cap <= 0) return { cap: null, used: 0 };
  const { year, month } = johannesburgDateParts(state.now);
  const thisMonth = year * 12 + month;
  const used = state.stamps.filter((stamp) => {
    if (
      stamp.restaurantId !== restaurantId ||
      stamp.status !== "valid" ||
      stamp.reason !== "bonus"
    ) {
      return false;
    }
    if (!stamp.key) return false;
    if (!stamp.key.startsWith("double:") && !stamp.key.startsWith("streak:")) return false;
    const at = johannesburgDateParts(Date.parse(stamp.createdAt));
    return at.year * 12 + at.month === thisMonth;
  }).length;
  return { cap, used };
}

function grantWithBudget(
  state: ReturnType<typeof demoRepo.read>,
  restaurant: Pick<Restaurant, "id" | "toolStampBudget">,
  membershipId: string,
  count: number,
  keyBase: string,
  atMs: number,
): number {
  const { cap, used } = toolBudgetStatus(state, restaurant.id);
  if (cap !== null && used + count > cap) return 0;
  return grantStampEvents({
    restaurantId: restaurant.id,
    membershipId,
    count,
    reason: "bonus",
    keyBase,
    at: new Date(atMs).toISOString(),
  }).granted;
}

/** Called after any visit stamp: double stamp day first, then the streak run. */
export function evaluateToolsAfterVisit(membershipId: string, visitStampId: string): number {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  const restaurant = membership
    ? state.restaurants.find((item) => item.id === membership.restaurantId)
    : undefined;
  if (!membership || !restaurant) return 0;
  let granted = 0;
  const doubleStamp = restaurant.doubleStamp;
  if (doubleStamp?.enabled && visitStampId) {
    const visit = state.stamps.find((stamp) => stamp.id === visitStampId);
    if (visit && johannesburgWeekday(Date.parse(visit.createdAt)) === Math.floor(doubleStamp.weekday)) {
      granted += grantWithBudget(state, restaurant, membership.id, 1, `double:${visit.id}`, Date.parse(visit.createdAt));
    }
  }
  const config = restaurant.streak;
  if (config?.enabled) {
    const run = streakRun(state, membership.id, config);
    if (run >= config.weeks && run % config.weeks === 0) {
      granted += grantWithBudget(state, restaurant, membership.id, config.bonusStamps, `streak:${run}`, state.now);
    }
  }
  return granted;
}

export function saveTools(input: {
  restaurantId: string;
  doubleStamp: { enabled: boolean; weekday: number };
  streak: StreakConfig;
  toolStampBudget: number;
}) {
  const state = demoRepo.read();
  if (!state.restaurants.some((item) => item.id === input.restaurantId)) {
    return failure("NOT_FOUND", "Restaurant not found.");
  }
  const weekday = Math.floor(input.doubleStamp.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return failure("INVALID", "Pick a weekday between Sunday and Saturday.");
  }
  if (
    input.doubleStamp.enabled &&
    (!Number.isInteger(input.toolStampBudget) || input.toolStampBudget < 1 || input.toolStampBudget > 2000)
  ) {
    return failure("INVALID", "Set the monthly bonus stamp budget between 1 and 2000.");
  }
  const weeks = Math.floor(input.streak.weeks);
  if (!Number.isInteger(weeks) || weeks < 2 || weeks > 12) {
    return failure("INVALID", "Streak runs must be between 2 and 12 weeks.");
  }
  const weeklyVisits = Math.floor(input.streak.weeklyVisits);
  if (!Number.isInteger(weeklyVisits) || weeklyVisits < 1 || weeklyVisits > 7) {
    return failure("INVALID", "Weekly visits must be between 1 and 7.");
  }
  const bonusStamps = Math.floor(input.streak.bonusStamps);
  if (!Number.isInteger(bonusStamps) || bonusStamps < 1 || bonusStamps > 5) {
    return failure("INVALID", "Streak bonus stamps must be between 1 and 5.");
  }
  if (input.streak.enabled &&
    (!Number.isInteger(input.toolStampBudget) || input.toolStampBudget < 1 || input.toolStampBudget > 2000)) {
    return failure("INVALID", "Set the monthly bonus stamp budget between 1 and 2000.");
  }
  const streak: StreakConfig = {
    enabled: input.streak.enabled,
    weeks,
    weeklyVisits,
    bonusStamps,
  };
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((item) =>
      item.id === input.restaurantId
        ? {
            ...item,
            doubleStamp: { enabled: input.doubleStamp.enabled, weekday },
            streak,
            toolStampBudget: Math.floor(input.toolStampBudget) || 0,
          }
        : item,
    ),
  }));
  return success({ doubleStamp: { enabled: input.doubleStamp.enabled, weekday }, streak });
}

/** What the owner sees about this month's tool budget. */
export function toolBudgetFor(restaurantId: string) {
  return toolBudgetStatus(demoRepo.read(), restaurantId);
}

/** What the guest card shows for double stamp day and the visit streak. */
export interface GuestToolsView {
  doubleDayLine: string | null;
  streak: {
    run: number;
    weeks: number;
    visitsThisWeek: number;
    weeklyVisits: number;
    bonusStamps: number;
  } | null;
}

export function guestToolsView(
  state: ReturnType<typeof demoRepo.read>,
  membership: Pick<import("@/data/types").Membership, "id" | "restaurantId">,
): GuestToolsView {
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  if (!restaurant) return { doubleDayLine: null, streak: null };
  const doubleStamp = restaurant.doubleStamp;
  const streakConfig = restaurant.streak;
  let streak: GuestToolsView["streak"] = null;
  if (streakConfig?.enabled) {
    const run = streakRun(state, membership.id, streakConfig);
    const thisWeek = visitsInWeek(state, membership.id, johannesburgWeekIndex(state.now));
    streak = {
      run,
      weeks: streakConfig.weeks,
      visitsThisWeek: thisWeek,
      weeklyVisits: streakConfig.weeklyVisits,
      bonusStamps: streakConfig.bonusStamps,
    };
  }
  return {
    doubleDayLine: doubleStamp?.enabled
      ? `Double stamp day: every ${weekdayLabel(doubleStamp.weekday)}. A visit that day earns one extra stamp.`
      : null,
    streak,
  };
}
