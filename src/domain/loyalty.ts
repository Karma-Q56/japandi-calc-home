import { demoRepo, updateDemo } from "@/data/repo";
import type { Challenge, Membership, Restaurant, TierName } from "@/data/types";
import { birthdayOf, johannesburgMonthDay } from "@/lib/birthday";
import { grantStampEvents, visitsInWindow, allVisits } from "./grants";

const TIER_ORDER: TierName[] = ["new", "regular", "vip"];

export interface BirthdayRewardPreview {
  kind: "stamp" | "freeItem";
  guestLine: string;
  tillLine: string;
}

/** What the guest and the till would see for this restaurant's birthday choice. */
export function birthdayRewardPreview(restaurantId: string): BirthdayRewardPreview | null {
  const restaurant = demoRepo
    .read()
    .restaurants.find((item) => item.id === restaurantId);
  if (!restaurant?.birthdayReward) return null;
  const item = restaurant.birthdayRewardItem?.trim() || "the birthday treat";
  if (restaurant.birthdayRewardKind === "freeItem") {
    return {
      kind: "freeItem",
      guestLine: `Happy birthday week! Visit in your birthday week and your ${item} is on us.`,
      tillLine: `This guest is in their birthday week. Give them a free ${item}, once this year.`,
    };
  }
  return {
    kind: "stamp",
    guestLine: "Happy birthday week! A bonus stamp is waiting on your card this week.",
    tillLine: "This guest is in their birthday week. Add the birthday bonus stamp, once this year.",
  };
}

export interface TierState {
  tier: TierName;
  visits: number;
  nextTier: TierName | null;
  visitsToNext: number;
}

/** Tiers look at visit frequency (last 90 days), not the stamp balance. */
export function tierFor(
  state: ReturnType<typeof demoRepo.read>,
  membership: Pick<Membership, "id" | "restaurantId">,
): TierName {
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  if (!restaurant) return "new";
  const visits = visitsInWindow(state, membership.id, 90);
  if (visits >= restaurant.tiers.vip) return "vip";
  if (visits >= restaurant.tiers.regular) return "regular";
  return "new";
}

export function tierState(
  state: ReturnType<typeof demoRepo.read>,
  membership: Pick<Membership, "id" | "restaurantId">,
): TierState {
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  const visits = visitsInWindow(state, membership.id, 90);
  const tier = tierFor(state, membership);
  const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] ?? null;
  const threshold = !restaurant
    ? 0
    : nextTier === "regular"
      ? restaurant.tiers.regular
      : nextTier === "vip"
        ? restaurant.tiers.vip
        : 0;
  return {
    tier,
    visits,
    nextTier,
    visitsToNext: nextTier ? Math.max(0, threshold - visits) : 0,
  };
}

export function tierLabel(tier: TierName): string {
  return tier === "vip" ? "VIP" : tier === "regular" ? "Regular" : "New face";
}

/** Does this tier meet a special's minimum? Missing minimum means everyone. */
export function tierMeets(tier: TierName, minTier: TierName | null | undefined): boolean {
  if (!minTier) return true;
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minTier);
}

export interface ChallengeProgress {
  challenge: Challenge;
  visits: number;
  done: boolean;
  claimed: boolean;
}

export function challengeProgress(
  state: ReturnType<typeof demoRepo.read>,
  membership: Pick<Membership, "id" | "restaurantId">,
): ChallengeProgress[] {
  return state.challenges
    .filter((item) => item.restaurantId === membership.restaurantId && item.active)
    .map((challenge) => {
      const visits = visitsInWindow(state, membership.id, challenge.windowDays);
      const claimed = state.stamps.some(
        (stamp) =>
          stamp.membershipId === membership.id && stamp.key === `challenge:${challenge.id}`,
      );
      return {
        challenge,
        visits,
        done: visits >= challenge.visits,
        claimed,
      };
    });
}

/** Called after a visit: grant bonus stamps for any newly completed challenge. */
export function evaluateChallenges(membershipId: string): number {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!membership) return 0;
  let granted = 0;
  for (const progress of challengeProgress(state, membership)) {
    if (!progress.done || progress.claimed) continue;
    const result = grantStampEvents({
      restaurantId: membership.restaurantId,
      membershipId,
      count: progress.challenge.bonusStamps,
      reason: "challenge",
      keyBase: `challenge:${progress.challenge.id}`,
    });
    granted += result.granted;
  }
  return granted;
}

/**
 * A birthday treat lands once per calendar year, in the birthday week. The owner
 * chooses a bonus stamp or a free item; the till shows which one to hand over.
 */
export function awardBirthdayIfDue(membershipId: string): number {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!membership) return 0;
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  const customer = state.customers.find((item) => item.id === membership.customerId);
  const parts = birthdayOf(customer);
  if (!restaurant?.birthdayReward || !parts) return 0;
  const now = new Date(state.now);
  // Compare in Johannesburg time so the reward appears on the guest's day.
  const today = johannesburgMonthDay(state.now);
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(now);
  if (Number(today.month) !== parts.month) return 0;
  // Allow the whole birthday week (3 days either side).
  if (Math.abs(Number(today.day) - parts.day) > 3) return 0;
  if (restaurant.birthdayRewardKind === "freeItem") {
    const item = restaurant.birthdayRewardItem?.trim() || "the birthday treat";
    const key = `birthday-item:${year}`;
    if (state.rewards.some((reward) => reward.membershipId === membershipId && reward.key === key))
      return 0;
    updateDemo((current) => ({
      ...current,
      rewards: [
        ...current.rewards,
        {
          id: `reward-${crypto.randomUUID()}`,
          restaurantId: membership.restaurantId,
          membershipId,
          description: `Free ${item}`, 
          earnedAt: new Date(state.now).toISOString(),
          key,
        },
      ],
    }));
    return 1;
  }
  const result = grantStampEvents({
    restaurantId: membership.restaurantId,
    membershipId,
    count: 1,
    reason: "birthday",
    keyBase: `birthday:${year}`,
  });
  return result.granted;
}

/** Every Nth visit is a mystery bonus stamp, deterministic per membership. */
export function awardMysteryIfDue(membershipId: string): number {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!membership) return 0;
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  if (!restaurant || restaurant.mysteryEveryVisits <= 0) return 0;
  const visits = allVisits(state, membershipId);
  if (visits === 0 || visits % restaurant.mysteryEveryVisits !== 0) return 0;
  const result = grantStampEvents({
    restaurantId: membership.restaurantId,
    membershipId,
    count: 1,
    reason: "mystery",
    keyBase: `mystery:${visits}`,
  });
  return result.granted;
}

export function saveChallenge(input: {
  id?: string;
  restaurantId: string;
  title: string;
  visits: number;
  windowDays: number;
  bonusStamps: number;
}) {
  const state = demoRepo.read();
  const title = input.title.trim();
  if (title.length < 2 || title.length > 70) {
    return { ok: false as const, error: { code: "INVALID", message: "Give the challenge a short title." } };
  }
  if (input.visits < 2 || input.visits > 50) {
    return { ok: false as const, error: { code: "INVALID", message: "Visits must be between 2 and 50." } };
  }
  if (input.windowDays < 1 || input.windowDays > 365) {
    return { ok: false as const, error: { code: "INVALID", message: "The window must be 1 to 365 days." } };
  }
  if (input.bonusStamps < 1 || input.bonusStamps > 5) {
    return { ok: false as const, error: { code: "INVALID", message: "Bonus stamps must be 1 to 5." } };
  }
  const challenge: Challenge = {
    id: input.id ?? `challenge-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    title,
    visits: input.visits,
    windowDays: input.windowDays,
    bonusStamps: input.bonusStamps,
    active: true,
    createdAt: new Date(state.now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    challenges: input.id
      ? current.challenges.map((item) => (item.id === challenge.id ? { ...challenge, active: item.active } : item))
      : [...current.challenges, challenge],
  }));
  return { ok: true as const, data: challenge };
}

export function setChallengeActive(id: string, active: boolean) {
  const state = demoRepo.read();
  if (!state.challenges.some((item) => item.id === id)) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "Challenge not found." } };
  }
  updateDemo((current) => ({
    ...current,
    challenges: current.challenges.map((item) =>
      item.id === id ? { ...item, active } : item,
    ),
  }));
  return { ok: true as const, data: active };
}

export type RestaurantLoyalty = Pick<
  Restaurant,
  "tiers" | "mysteryEveryVisits" | "birthdayReward" | "birthdayRewardKind" | "birthdayRewardItem"
>;
