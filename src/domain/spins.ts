import { demoRepo, updateDemo } from "@/data/repo";
import type { Restaurant, SpinConfig, SpinResult, SpinSegment } from "@/data/types";
import { failure, success } from "./demo";
import { logAudit } from "./audit";
import { allVisits } from "./grants";
import { createPrizeOffer } from "./specials";

const DAY = 86400000;

export interface SpinState {
  enabled: boolean;
  earned: number;
  used: number;
  available: number;
  visits: number;
  rules: string;
  segments: Array<{ id: string; label: string }>;
}

export function spinsUsed(membershipId: string): number {
  return demoRepo.read().spins.filter((item) => item.membershipId === membershipId).length;
}

/** Spins are earned by visits and reward milestones — never purchased. */
export function spinsEarned(
  state: ReturnType<typeof demoRepo.read>,
  membershipId: string,
  config: SpinConfig,
): number {
  if (!config.enabled) return 0;
  const visits = allVisits(state, membershipId);
  const milestones = state.rewards.filter((item) => item.membershipId === membershipId).length;
  const earned =
    Math.floor(visits / Math.max(1, config.earnEveryVisits)) +
    (config.earnAtMilestone ? milestones : 0);
  return Math.max(0, earned - spinsUsed(membershipId));
}

export function spinState(membershipId: string): SpinState {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  const restaurant = membership
    ? state.restaurants.find((item) => item.id === membership.restaurantId)
    : undefined;
  const config = restaurant?.spin;
  const visits = membership ? allVisits(state, membershipId) : 0;
  const earned = membership && config ? spinsEarned(state, membershipId, config) : 0;
  return {
    enabled: !!config?.enabled && config.segments.length > 0,
    earned,
    used: spinsUsed(membershipId),
    available: earned,
    visits,
    rules: config?.rules ?? "",
    segments: (config?.segments ?? []).map((segment) => ({
      id: segment.id,
      label: segment.label,
    })),
  };
}

function windowStart(now: number, period: "day" | "week"): number {
  if (period === "week") return now - 7 * DAY;
  return new Date(now).setUTCHours(0, 0, 0, 0);
}

function segmentAllowed(
  state: ReturnType<typeof demoRepo.read>,
  restaurantId: string,
  segment: SpinSegment,
  now: number,
): boolean {
  if (segment.cap) {
    const from = windowStart(now, segment.cap.period);
    const count = state.spins.filter(
      (spin) =>
        spin.restaurantId === restaurantId &&
        spin.segmentId === segment.id &&
        new Date(spin.wonAt).getTime() >= from,
    ).length;
    if (count >= segment.cap.max) return false;
  }
  return true;
}

function budgetLeft(
  state: ReturnType<typeof demoRepo.read>,
  restaurantId: string,
  config: SpinConfig,
  now: number,
): number {
  const spent = state.spins
    .filter(
      (spin) =>
        spin.restaurantId === restaurantId && new Date(spin.wonAt).getTime() >= now - 7 * DAY,
    )
    .reduce((sum, spin) => sum + spin.valueCents, 0);
  return Math.max(0, config.weeklyBudgetCents - spent);
}

/** Weighted pick with crypto randomness; the result never leaves the server. */
export function pickSegment(segments: SpinSegment[], random: () => number): SpinSegment | null {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.weight), 0);
  if (total <= 0) return null;
  let ticket = random() * total;
  for (const segment of segments) {
    ticket -= Math.max(0, segment.weight);
    if (ticket < 0) return segment;
  }
  return segments[segments.length - 1] ?? null;
}

function cryptoRandom(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return value / 0x1_0000_0000;
}

export function spinWheel(input: {
  restaurantId: string;
  membershipId: string;
  actor?: string;
}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  const membership = state.memberships.find(
    (item) => item.id === input.membershipId && item.restaurantId === input.restaurantId,
  );
  if (!restaurant || !membership) return failure("NOT_FOUND", "Membership not found.");
  const config = restaurant.spin;
  if (!config.enabled || config.segments.length === 0) {
    return failure("INVALID", "The spin wheel is not open yet.");
  }
  if (spinsEarned(state, membership.id, config) <= 0) {
    return failure("INVALID", "Earn a spin with more visits first.");
  }
  const budget = budgetLeft(state, restaurant.id, config, state.now);
  const candidates = config.segments.filter(
    (segment) =>
      segment.weight > 0 &&
      segment.valueCents <= budget &&
      segmentAllowed(state, restaurant.id, segment, state.now),
  );
  if (candidates.length === 0) {
    return failure("INVALID", "No prizes are available right now. Try again next week.");
  }
  const segment = pickSegment(candidates, cryptoRandom);
  if (!segment) return failure("INVALID", "The wheel is empty right now.");
  const wonAt = new Date(state.now).toISOString();
  let prizeSpecialId: string | undefined;
  const isPrize = !/try again|nothing|no prize/i.test(segment.label);
  if (isPrize) {
    const prize = createPrizeOffer({
      restaurantId: restaurant.id,
      membershipId: membership.id,
      label: segment.label,
      valueCents: segment.valueCents,
    });
    prizeSpecialId = prize.special.id;
  }
  const result: SpinResult = {
    id: `spin-${crypto.randomUUID()}`,
    restaurantId: restaurant.id,
    membershipId: membership.id,
    segmentId: segment.id,
    label: segment.label,
    valueCents: segment.valueCents,
    wonAt,
    ...(prizeSpecialId ? { prizeSpecialId } : {}),
  };
  updateDemo((current) => ({ ...current, spins: [...current.spins, result] }));
  logAudit({
    actor: input.actor ?? membership.customerId,
    action: "spin",
    restaurantId: restaurant.id,
    object: result.id,
  });
  return success(result);
}

/** Plain-language rules/T&Cs the owner can copy onto their page. */
export function spinRulesText(restaurant: Pick<Restaurant, "name" | "spin">): string {
  const config = restaurant.spin;
  const lines = [
    `${restaurant.name} Spin & Win — rules`,
    `• One spin is earned every ${config.earnEveryVisits} recorded visits${config.earnAtMilestone ? " and at every reward milestone" : ""}.`,
    "• No purchase is required to earn spins. Spins have no cash value and cannot be bought, sold or transferred.",
    `• Prizes are personal, single-use offers, valid for 30 days, and are limited by a weekly prize budget of R${(config.weeklyBudgetCents / 100).toFixed(2)}.`,
    "• Odds depend on the wheel segments published below; some segments may be unavailable once their cap or the weekly budget is reached.",
    "• The venue's decision is final. This promotion is run by the venue, not by Patron.",
    ...config.segments.map(
      (segment) => `• ${segment.label} — weight ${segment.weight}${segment.cap ? `, max ${segment.cap.max} per ${segment.cap.period}` : ""}.`,
    ),
  ];
  return lines.join("\n");
}

export function saveSpinConfig(input: {
  restaurantId: string;
  config: SpinConfig;
}) {
  const state = demoRepo.read();
  if (!state.restaurants.some((item) => item.id === input.restaurantId)) {
    return failure("NOT_FOUND", "Restaurant not found.");
  }
  const config = input.config;
  if (config.earnEveryVisits < 1 || config.earnEveryVisits > 50) {
    return failure("INVALID", "Spins per visits must be between 1 and 50 visits.");
  }
  if (config.weeklyBudgetCents < 0) return failure("INVALID", "The weekly budget cannot be negative.");
  for (const segment of config.segments) {
    if (!segment.label.trim()) return failure("INVALID", "Every segment needs a prize name.");
    if (segment.weight < 0) return failure("INVALID", "Weights cannot be negative.");
    if (segment.valueCents < 0) return failure("INVALID", "Prize values cannot be negative.");
  }
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((item) =>
      item.id === input.restaurantId
        ? {
            ...item,
            spin: {
              ...config,
              rules: config.rules?.trim() || spinRulesText({ ...item, spin: config }),
            },
          }
        : item,
    ),
  }));
  return success(config);
}

export function listSpins(restaurantId: string) {
  const state = demoRepo.read();
  return state.spins
    .filter((item) => item.restaurantId === restaurantId)
    .sort((a, b) => b.wonAt.localeCompare(a.wonAt));
}

export function spendForWeek(restaurantId: string): number {
  const state = demoRepo.read();
  return state.spins
    .filter(
      (spin) =>
        spin.restaurantId === restaurantId &&
        new Date(spin.wonAt).getTime() >= state.now - 7 * DAY,
    )
    .reduce((sum, spin) => sum + spin.valueCents, 0);
}
