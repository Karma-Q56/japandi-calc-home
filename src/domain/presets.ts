import { demoRepo } from "@/data/repo";
import type { Restaurant } from "@/data/types";
import { birthdayOf } from "@/lib/birthday";
import { grantStampEvents } from "./grants";
import { johannesburgDateParts, toolBudgetStatus } from "./tools";
import { createSpecial, issueTargetedCodes } from "./specials";
import { logAudit } from "./audit";

const DAY = 86400000;

/** One "We miss you" treat per guest per 60 days, whatever kind it is. */
export const MISS_YOU_COOLDOWN_DAYS = 60;
export const MISS_YOU_MIN_AFTER_DAYS = 14;
export const MISS_YOU_MAX_AFTER_DAYS = 90;

type DemoState = ReturnType<typeof demoRepo.read>;

function missYouTitle(item: string) {
  return `We miss you: ${item}`;
}

/** The plain cover title for a hand-out special, reused meal by meal. */
function customTitle(name: string) {
  return `Reward for you: ${name}`;
}

function jhbMonthIndex(atMs: number) {
  const { year, month } = johannesburgDateParts(atMs);
  return year * 12 + month;
}

function issuedThisMonth(code: { issuedAt: string }, nowMs: number) {
  return jhbMonthIndex(new Date(code.issuedAt).getTime()) === jhbMonthIndex(nowMs);
}

/**
 * True while the guest is inside the 60 day miss-you cooldown. Bonus stamps
 * leave a stamp behind; free items leave a personal offer code behind. One
 * window covers both, so switching kinds mid-way never pays twice.
 */
export function missYouCooldownLive(
  state: DemoState,
  membershipId: string,
  nowMs: number,
): boolean {
  const cutoff = nowMs - MISS_YOU_COOLDOWN_DAYS * DAY;
  if (
    state.stamps.some(
      (stamp) =>
        stamp.membershipId === membershipId &&
        (stamp.reason ?? "") === "missyou" &&
        stamp.status === "valid" &&
        new Date(stamp.createdAt).getTime() >= cutoff,
    )
  ) {
    return true;
  }
  return state.specialCodes.some((code) => {
    if (code.membershipId !== membershipId) return false;
    const special = state.specials.find((item) => item.id === code.specialId);
    if (!special || !special.title.startsWith("We miss you")) return false;
    return new Date(code.issuedAt).getTime() >= cutoff;
  });
}

/** Guests who have not visited for long enough and are not in a cooldown. */
export function eligibleMissYouMembers(
  state: DemoState,
  restaurantId: string,
  config: NonNullable<Restaurant["missYou"]>,
): { id: string; lastVisitAt: string }[] {
  const nowMs = state.now;
  return state.memberships
    .filter((membership) => {
      if (membership.restaurantId !== restaurantId) return false;
      if (missYouCooldownLive(state, membership.id, nowMs)) return false;
      const lastMs = membership.lastVisitAt ? new Date(membership.lastVisitAt).getTime() : null;
      if (lastMs === null) return false;
      return nowMs - lastMs >= config.afterDays * DAY;
    })
    .map((membership) => ({ id: membership.id, lastVisitAt: membership.lastVisitAt as string }));
}

export interface MissYouOutcome {
  /** Bonus stamps granted; a free item reports 1 treated guest, no stamps. */
  granted: number;
  reason: "ok" | "off" | "cooldown" | "not-long-enough" | "budget" | "error";
}

/** Give the miss-you treat to one guest if the rule applies. */
export function issueMissYouFor(restaurantId: string, membershipId: string): MissYouOutcome {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!restaurant || !membership) return { granted: 0, reason: "off" };
  const config = restaurant.missYou;
  if (!config?.enabled) return { granted: 0, reason: "off" };
  const nowMs = state.now;
  const lastMs = membership.lastVisitAt ? new Date(membership.lastVisitAt).getTime() : null;
  if (lastMs === null) return { granted: 0, reason: "not-long-enough" };
  if (nowMs - lastMs < config.afterDays * DAY) return { granted: 0, reason: "not-long-enough" };
  if (missYouCooldownLive(state, membershipId, nowMs)) return { granted: 0, reason: "cooldown" };
  if (config.kind === "stamp") {
    const { cap, used } = toolBudgetStatus(state, restaurantId);
    if (cap !== null && used + 1 > cap) return { granted: 0, reason: "budget" };
    const day = johannesburgDateParts(nowMs);
    const keyBase = `missyou:${membershipId}:${day.year}-${
      String(day.month).padStart(2, "0")
    }-${String(day.day).padStart(2, "0")}`;
    const result = grantStampEvents({
      restaurantId,
      membershipId,
      count: 1,
      reason: "missyou",
      keyBase,
      at: new Date(nowMs).toISOString(),
    });
    if (result.granted > 0) {
      logAudit({ actor: "system", action: "miss_you_award", restaurantId, object: membershipId });
    }
    return { granted: result.granted, reason: result.granted > 0 ? "ok" : "error" };
  }
  const item = (config.item ?? "").trim() || "treat";
  const title = missYouTitle(item);
  const reused = state.specials.find(
    (special) =>
      special.restaurantId === restaurantId &&
      special.kind === "targeted" &&
      special.active &&
      special.title === title &&
      (!special.endsAt || new Date(special.endsAt).getTime() > nowMs),
  );
  if (reused) {
    issueTargetedCodes(reused.id, [membershipId]);
  } else {
    const created = createSpecial({
      restaurantId,
      title,
      body: `A small treat from ${restaurant.name}. Show this at the till.`,
      startsAt: new Date(nowMs).toISOString(),
      endsAt: new Date(nowMs + 30 * DAY).toISOString(),
      kind: "targeted",
      targetMembershipIds: [membershipId],
    });
    if (!created.ok) return { granted: 0, reason: "error" };
  }
  logAudit({ actor: "system", action: "miss_you_award", restaurantId, object: membershipId });
  return { granted: 1, reason: "ok" };
}

/** Give the miss-you treat to every guest who qualifies right now. */
export function runMissYou(restaurantId: string): {
  enabled: boolean;
  treated: number;
  stamps: number;
  skippedBudget: number;
} {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant?.missYou?.enabled) {
    return { enabled: false, treated: 0, stamps: 0, skippedBudget: 0 };
  }
  const eligible = eligibleMissYouMembers(state, restaurantId, restaurant.missYou);
  let treated = 0;
  let stamps = 0;
  let skippedBudget = 0;
  for (const member of eligible) {
    const outcome = issueMissYouFor(restaurantId, member.id);
    if (outcome.reason === "budget") skippedBudget++;
    if (outcome.reason === "ok") {
      treated++;
      stamps += outcome.granted;
    }
  }
  return { enabled: true, treated, stamps, skippedBudget };
}

export interface CustomRewardOutcome {
  ok: boolean;
  reason: "ok" | "off" | "missing-name" | "limit" | "error";
  limit?: number;
}

function createHandout(restaurantId: string, title: string, body: string, nowMs: number) {
  return createSpecial({
    restaurantId,
    title,
    body,
    startsAt: new Date(nowMs).toISOString(),
    endsAt: new Date(nowMs + 30 * DAY).toISOString(),
    kind: "targeted",
    targetMembershipIds: [],
  });
}

/**
 * Hand the custom reward to one guest at the till. One offer covers the name,
 * personal codes issue one at a time, and the monthly limit is enforced.
 */
export function giveCustomReward(input: {
  restaurantId: string;
  membershipId: string;
}): CustomRewardOutcome {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  const membership = state.memberships.find((item) => item.id === input.membershipId);
  if (!restaurant || !membership) return { ok: false, reason: "off" };
  const config = restaurant.customReward;
  if (!config?.enabled) return { ok: false, reason: "off" };
  const name = config.name.trim();
  if (name.length < 1) return { ok: false, reason: "missing-name" };
  const limit = Math.max(1, Math.floor(config.limitPerGuestPerMonth || 1));
  const title = customTitle(name);
  const nowMs = state.now;
  const usedThisMonth = state.specialCodes.filter((code) => {
    if (code.membershipId !== input.membershipId) return false;
    if (!issuedThisMonth(code, nowMs)) return false;
    const special = state.specials.find((item) => item.id === code.specialId);
    return special?.title === title;
  }).length;
  if (usedThisMonth >= limit) return { ok: false, reason: "limit", limit };
  const existing = state.specials.find(
    (special) =>
      special.restaurantId === input.restaurantId &&
      special.kind === "targeted" &&
      special.title === title,
  );
  const reusable =
    existing &&
    existing.active &&
    (!existing.endsAt || new Date(existing.endsAt).getTime() > nowMs)
      ? existing
      : null;
  const specialId = reusable ? reusable.id : null;
  if (!specialId) {
    const created = createHandout(
      input.restaurantId,
      title,
      `A treat at the till: ${name}. Show this code.`,
      nowMs,
    );
    if (!created.ok) return { ok: false, reason: "error", limit };
    issueTargetedCodes(created.data.id, [input.membershipId]);
  } else {
    issueTargetedCodes(specialId, [input.membershipId]);
  }
  logAudit({
    actor: "owner",
    action: "custom_reward",
    restaurantId: input.restaurantId,
    object: input.membershipId,
  });
  return { ok: true, reason: "ok", limit };
}

export interface PresetCost {
  id: string;
  title: string;
  /** Guests the rule applies to right now, from demo data. */
  guests: number;
  note: string;
}

/** Plain cost lines for the preset cards, worked out from demo data. */
export function presetCosts(restaurantId: string): PresetCost[] {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return [];
  const nowMs = state.now;
  const cutoff = nowMs - 30 * DAY;
  const visits30 = state.stamps.filter(
    (stamp) =>
      stamp.restaurantId === restaurantId &&
      stamp.status === "valid" &&
      (stamp.reason ?? "visit") === "visit" &&
      new Date(stamp.createdAt).getTime() >= cutoff,
  ).length;
  const joins30 = state.memberships.filter(
    (membership) =>
      membership.restaurantId === restaurantId &&
      new Date(membership.joinedAt).getTime() >= cutoff,
  ).length;
  const monthDay = johannesburgDateParts(nowMs);
  const birthdayGuestMonth = state.memberships.filter((membership) => {
    if (membership.restaurantId !== restaurantId) return false;
    const customer = state.customers.find((item) => item.id === membership.customerId);
    const parts = birthdayOf(customer);
    return parts !== null && parts.month === monthDay.month;
  }).length;
  return [
    {
      id: "collect",
      title: "Collect stamps",
      guests: 0,
      note:
        restaurant.stampsRequired > 0
          ? `${restaurant.stampsRequired} stamps earn the reward; the cost is the reward itself, no extra stamps.`
          : "Switched off.",
    },
    {
      id: "every-nth",
      title: "Every Nth visit",
      guests: restaurant.mysteryEveryVisits > 0 ? Math.floor(visits30 / restaurant.mysteryEveryVisits) : 0,
      note:
        restaurant.mysteryEveryVisits > 0
          ? `Every ${restaurant.mysteryEveryVisits}th visit earns 1 bonus stamp. Past 30 days: ${visits30} visits, so roughly ${Math.floor(visits30 / restaurant.mysteryEveryVisits)} bonus stamps a month at this pace.`
          : "Switched off.",
    },
    {
      id: "join",
      title: "When they join",
      guests: joins30,
      note:
        restaurant.welcomeStamps > 0
          ? `${joins30} join${joins30 === 1 ? "" : "s"} in the past 30 days start with ${restaurant.welcomeStamps} stamp${restaurant.welcomeStamps === 1 ? "" : "s"} each.`
          : "No welcome stamps.",
    },
    {
      id: "birthday",
      title: "Birthday week",
      guests: birthdayGuestMonth,
      note: `${birthdayGuestMonth} guest${birthdayGuestMonth === 1 ? "" : "s"} with a birthday in this month.`,
    },
    {
      id: "miss-you",
      title: "We miss you",
      guests: restaurant.missYou?.enabled
        ? eligibleMissYouMembers(state, restaurantId, restaurant.missYou).length
        : 0,
      note: restaurant.missYou?.enabled
        ? `${eligibleMissYouMembers(state, restaurantId, restaurant.missYou).length} guest${eligibleMissYouMembers(state, restaurantId, restaurant.missYou).length === 1 ? "" : "s"} have not visited for ${restaurant.missYou.afterDays} days or more.`
        : "Switched off.",
    },
    {
      id: "quiet-day",
      title: "Quiet day bonus",
      guests: 0,
      note: restaurant.doubleStamp?.enabled
        ? `Visits on the quiet weekday earn 1 extra stamp. Past 30 days: ${visits30} visits in total on all days, so check the busiest days panel for the split.`
        : "Set the quiet day in the Loyalty tools panel.",
    },
    {
      id: "streak",
      title: "Visit streak",
      guests: 0,
      note: restaurant.streak?.enabled
        ? `${restaurant.streak.weeklyVisits} visit${restaurant.streak.weeklyVisits === 1 ? "" : "s"} a week for ${restaurant.streak.weeks} week${restaurant.streak.weeks === 1 ? "" : "s"} earns ${restaurant.streak.bonusStamps} bonus stamp${restaurant.streak.bonusStamps === 1 ? "" : "s"}, from the monthly bonus budget.`
        : "Switched off.",
    },
    {
      id: "custom",
      title: "Custom",
      guests: state.specialCodes.filter((code) => {
        const special = state.specials.find((item) => item.id === code.specialId);
        return (
          special?.restaurantId === restaurantId &&
          special?.kind === "targeted" &&
          special?.title.startsWith("Reward for you:") &&
          issuedThisMonth(code, nowMs)
        );
      }).length,
      note: restaurant.customReward?.enabled
        ? `Handed out at the till, up to ${restaurant.customReward.limitPerGuestPerMonth} a guest a month.`
        : "Switched off.",
    },
  ];
}

/** The plain "when" list of every switched-on rule, in firing order. */
export function whatHappensWhen(restaurant: Restaurant): string[] {
  const lines: string[] = [];
  if (restaurant.stampsRequired > 0) {
    lines.push(
      `Each visit adds a stamp; ${restaurant.stampsRequired} stamps earn ${restaurant.rewardDescription || "the reward"}.`,
    );
  }
  if (restaurant.welcomeStamps > 0) {
    lines.push(
      `When someone joins: ${restaurant.welcomeStamps} welcome stamp${restaurant.welcomeStamps === 1 ? "" : "s"}.`,
    );
  }
  if (Number.isInteger(restaurant.mysteryEveryVisits) && restaurant.mysteryEveryVisits > 0) {
    lines.push(`Every ${restaurant.mysteryEveryVisits}th visit: a bonus stamp.`);
  }
  if (restaurant.birthdayReward) {
    lines.push(
      restaurant.birthdayRewardKind === "freeItem"
        ? `During their birthday week: a free ${restaurant.birthdayRewardItem || "treat"}.`
        : "During their birthday week: a bonus stamp.",
    );
  }
  if (restaurant.missYou?.enabled) {
    const item = (restaurant.missYou.item ?? "").trim();
    lines.push(
      `${restaurant.missYou.kind === "freeItem" && item ? `If we have not seen them for ${restaurant.missYou.afterDays} days: a free ${item}` : `If we have not seen them for ${restaurant.missYou.afterDays} days: a bonus stamp`}. Once every ${MISS_YOU_COOLDOWN_DAYS} days at most.`,
    );
  }
  if (restaurant.doubleStamp?.enabled) {
    lines.push(
      `On the quiet weekday: every visit that day earns one extra stamp (the double stamp day tool).`,
    );
  }
  if (restaurant.streak?.enabled) {
    lines.push(
      `Come back ${restaurant.streak.weeklyVisits} ${restaurant.streak.weeklyVisits === 1 ? "time" : "times"} a week for ${restaurant.streak.weeks} week${restaurant.streak.weeks === 1 ? "" : "s"} in a row: ${restaurant.streak.bonusStamps} bonus stamp${restaurant.streak.bonusStamps === 1 ? "" : "s"}.`,
    );
  }
  if (restaurant.customReward?.enabled) {
    lines.push(
      `Handed out by you at the till: ${restaurant.customReward.name || "a treat"}, up to ${restaurant.customReward.limitPerGuestPerMonth} a guest a month.`,
    );
  }
  return lines;
}
