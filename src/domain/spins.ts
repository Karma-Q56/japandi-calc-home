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
  welcomeEnabled: boolean;
  rewardDeciderEnabled: boolean;
  dailySurpriseEnabled: boolean;
  dailyAlreadyUsed: boolean;
  rewardReady: boolean;
}

export function spinsUsed(membershipId: string): number {
  return demoRepo.read().spins.filter(
    (item) =>
      item.membershipId === membershipId &&
      (item.mode === undefined || item.mode === "welcome" || item.mode === "visit"),
  ).length;
}

function spinsUsedForState(
  state: ReturnType<typeof demoRepo.read>,
  membershipId: string,
): number {
  return state.spins.filter(
    (item) =>
      item.membershipId === membershipId &&
      (item.mode === undefined || item.mode === "welcome" || item.mode === "visit"),
  ).length;
}

function localDateKey(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function modeEnabled(config: SpinConfig | undefined, mode: NonNullable<SpinConfig["modes"]>[number]): boolean {
  if (!config?.enabled) return false;
  // Older saved demo snapshots predate modes; preserve their original welcome wheel.
  return config.modes ? config.modes.includes(mode) : mode === "welcome";
}

function dailyAlreadyUsedFor(state: ReturnType<typeof demoRepo.read>, membershipId: string): boolean {
  const today = localDateKey(state.now);
  return state.spins.some(
    (spin) =>
      spin.membershipId === membershipId &&
      spin.mode === "daily_surprise" &&
      localDateKey(Date.parse(spin.wonAt)) === today,
  );
}

function activeSpecial(state: ReturnType<typeof demoRepo.read>, specialId: string, restaurantId: string) {
  const special = state.specials.find(
    (item) => item.id === specialId && item.restaurantId === restaurantId && item.active,
  );
  if (!special) return false;
  const now = state.now;
  return (!special.startsAt || Date.parse(special.startsAt) <= now) &&
    (!special.endsAt || Date.parse(special.endsAt) >= now);
}

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
  return Math.max(0, earned - spinsUsedForState(state, membershipId));
}

/** Spins are earned by visits and reward milestones — never purchased. */
export function spinState(membershipId: string): SpinState {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  const restaurant = membership
    ? state.restaurants.find((item) => item.id === membership.restaurantId)
    : undefined;
  const config = restaurant?.spin;
  const visits = membership ? allVisits(state, membershipId) : 0;
  const earned = membership && config ? spinsEarned(state, membershipId, config) : 0;
  const dailyAlreadyUsed = membership ? dailyAlreadyUsedFor(state, membership.id) : false;
  const rewardReady = membership
    ? state.rewards.some(
        (reward) =>
          reward.membershipId === membership.id &&
          reward.restaurantId === membership.restaurantId &&
          !reward.redeemedAt,
      )
    : false;
  return {
    enabled: !!config?.enabled && (
      modeEnabled(config, "welcome") ||
      modeEnabled(config, "reward_decider") ||
      modeEnabled(config, "daily_surprise")
    ),
    earned,
    used: spinsUsed(membershipId),
    available: earned,
    visits,
    rules: config?.rules ?? "",
    segments: (config?.segments ?? []).map((segment) => ({
      id: segment.id,
      label: segment.label,
    })),
    welcomeEnabled: modeEnabled(config, "welcome"),
    rewardDeciderEnabled: modeEnabled(config, "reward_decider"),
    dailySurpriseEnabled: modeEnabled(config, "daily_surprise"),
    dailyAlreadyUsed,
    rewardReady,
  };
}

function segmentAllowed(
  state: ReturnType<typeof demoRepo.read>,
  restaurantId: string,
  segment: SpinSegment,
  now: number,
): boolean {
  if (segment.cap) {
    const from = now - 7 * DAY;
    const today = segment.cap.period === "day" ? localDateKey(now) : undefined;
    const count = state.spins.filter((spin) => {
      if (spin.restaurantId !== restaurantId || spin.segmentId !== segment.id) return false;
      const wonAt = Date.parse(spin.wonAt);
      return today
        ? localDateKey(wonAt) === today
        : wonAt >= from;
    }).length;
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
    .reduce((sum, spin) => sum + (spin.mode === "reward_decider" ? 0 : spin.valueCents), 0);
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
  mode?: "welcome" | "reward_decider" | "daily_surprise";
}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  const membership = state.memberships.find(
    (item) => item.id === input.membershipId && item.restaurantId === input.restaurantId,
  );
  if (!restaurant || !membership) return failure("NOT_FOUND", "Membership not found.");
  const config = restaurant.spin;
  const mode = input.mode ?? "welcome";
  if (!modeEnabled(config, mode)) {
    return failure("INVALID", "This spin mode is not enabled for this restaurant.");
  }
  if (mode === "welcome" && spinsEarned(state, membership.id, config) <= 0) {
    return failure("INVALID", "Earn a spin with more visits first.");
  }
  const rewardToDecide = mode === "reward_decider"
    ? state.rewards
        .filter((reward) => reward.membershipId === membership.id && reward.restaurantId === restaurant.id && !reward.redeemedAt)
        .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))[0]
    : undefined;
  if (mode === "reward_decider" && !rewardToDecide) {
    return failure("INVALID", "Complete your card to spin for a reward.");
  }
  if (mode === "daily_surprise") {
    if (dailyAlreadyUsedFor(state, membership.id)) {
      return failure("INVALID", "Your daily surprise spin has already been used today.");
    }
    const pool = (config.dailyPool ?? []).filter((id) =>
      activeSpecial(state, id, restaurant.id) &&
      !state.specialCodes.some(
        (code) =>
          code.specialId === id &&
          code.membershipId === membership.id &&
          !code.redeemedAt,
      ),
    );
    if (pool.length === 0) {
      return failure("INVALID", "There are no daily surprises available today.");
    }
    const specialId = pool[Math.floor(cryptoRandom() * pool.length)]!;
    const special = state.specials.find((item) => item.id === specialId)!;
    const wonAt = new Date(state.now).toISOString();
    const prize = createPrizeOffer({
      restaurantId: restaurant.id,
      membershipId: membership.id,
      label: special.title,
      valueCents: 0,
    });
    updateDemo((current) => ({
      ...current,
      specials: current.specials.map((item) =>
        item.id === prize.special.id
          ? { ...item, body: special.body, endsAt: special.endsAt }
          : item,
      ),
    }));
    const result: SpinResult = {
      id: `spin-${crypto.randomUUID()}`,
      restaurantId: restaurant.id,
      membershipId: membership.id,
      segmentId: `daily-${special.id}`,
      label: special.title,
      valueCents: 0,
      wonAt,
      mode,
      code: prize.code.code,
      prizeSpecialId: prize.special.id,
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
  if (config.segments.length === 0) return failure("INVALID", "The spin wheel has no prize segments configured.");
  const budget = budgetLeft(state, restaurant.id, config, state.now);
  const isPrizeSegment = (segment: SpinSegment) => !/try again|nothing|no prize/i.test(segment.label);
  const candidates = config.segments.filter(
    (segment) =>
      segment.weight > 0 &&
      (mode === "reward_decider"
        ? isPrizeSegment(segment)
        : !isPrizeSegment(segment) || segment.valueCents <= budget) &&
      segmentAllowed(state, restaurant.id, segment, state.now),
  );
  if (candidates.length === 0) {
    return failure(
      "INVALID",
      mode === "reward_decider"
        ? "No reward choices are available right now. Try again next week."
        : "No prizes are available right now. Try again next week.",
    );
  }
  const eligibleSegments = mode === "reward_decider"
    ? candidates
    : candidates.filter((segment) => !isPrizeSegment(segment) || segment.valueCents <= budget);
  const segment = pickSegment(eligibleSegments, cryptoRandom);
  if (!segment) return failure("INVALID", "The wheel is empty right now.");
  const wonAt = new Date(state.now).toISOString();
  let prizeSpecialId: string | undefined;
  const isPrize = !/try again|nothing|no prize/i.test(segment.label);
  if (mode === "reward_decider" && !isPrize) {
    return failure("INVALID", "The reward wheel needs at least one prize segment.");
  }
  if (mode === "reward_decider" && rewardToDecide) {
    updateDemo((current) => ({
      ...current,
      rewards: current.rewards.map((reward) =>
        reward.id === rewardToDecide.id ? { ...reward, description: segment.label } : reward,
      ),
    }));
  } else if (isPrize) {
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
    mode,
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
    `• Modes: ${(config.modes ?? ["welcome"]).join(", ") || "none"}.`,
    `• Welcome spins are earned every ${config.earnEveryVisits} recorded visits${config.earnAtMilestone ? " and at every reward milestone" : ""}.`,
    ...(config.dailyPool?.length ? ["• Daily surprise specials: " + config.dailyPool.map((id) => demoRepo.read().specials.find((special) => special.id === id)?.title ?? "Unavailable special").join(", ") + ". One per guest per Johannesburg calendar day."] : []),
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
  const config: SpinConfig = {
    ...input.config,
    modes: input.config.modes ?? ["welcome"],
    dailyPool: input.config.dailyPool ?? [],
  };
  if (!Number.isInteger(config.weeklyBudgetCents) || config.weeklyBudgetCents < 0) {
    return failure("INVALID", "The weekly budget must be a non-negative whole number of cents.");
  }
  if (!Number.isInteger(config.earnEveryVisits) || config.earnEveryVisits < 1 || config.earnEveryVisits > 50) {
    return failure("INVALID", "Spins per visits must be a whole number between 1 and 50.");
  }
  if ((config.modes ?? []).some((mode) => !["welcome", "reward_decider", "daily_surprise"].includes(mode))) return failure("INVALID", "Choose a supported wheel mode.");
  if ((config.modes ?? []).includes("daily_surprise")) {
    const pool = (config.dailyPool ?? []).filter((id) =>
      activeSpecial(state, id, input.restaurantId),
    );
    if (pool.length === 0) {
      return failure("INVALID", "Choose at least one active special for the daily surprise pool.");
    }
  }
  if ((config.modes ?? []).includes("welcome") && config.segments.length === 0) {
    return failure("INVALID", "Add at least one prize segment for welcome spins.");
  }
  for (const segment of config.segments) {
    if (!segment.label.trim()) return failure("INVALID", "Every segment needs a prize name.");
    if (!Number.isFinite(segment.weight) || segment.weight < 0) return failure("INVALID", "Weights must be non-negative numbers.");
    if (!Number.isInteger(segment.valueCents) || segment.valueCents < 0) return failure("INVALID", "Prize values must be non-negative whole cents.");
    if (segment.cap && (!Number.isInteger(segment.cap.max) || segment.cap.max < 1)) {
      return failure("INVALID", "Prize caps must be at least one spin.");
    }
  }
  if (config.segments.length > 0 && config.segments.every((segment) => segment.weight === 0)) {
    return failure("INVALID", "At least one prize segment must have a positive weight.");
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
