import { demoRepo, updateDemo } from "@/data/repo";
import type { StampEvent, StampReason } from "@/data/types";

/**
 * Add stamps that are not a normal visit (welcome, challenge, mystery, birthday,
 * bonus). Idempotent per key: calling again with the same key never double
 * grants. Threshold crossings create rewards exactly like a till stamp.
 */
export function grantStampEvents(input: {
  restaurantId: string;
  membershipId: string;
  count: number;
  reason: StampReason;
  keyBase: string;
  staffId?: string | null;
  at?: string;
}): GrantResult {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  const membership = state.memberships.find((item) => item.id === input.membershipId);
  if (!restaurant || !membership || input.count <= 0) {
    return { granted: 0, stampIds: [], rewardIds: [] };
  }
  const at = input.at ?? new Date(state.now).toISOString();
  const created: StampEvent[] = [];
  for (let index = 0; index < input.count; index++) {
    const key = input.count > 1 ? `${input.keyBase}:${index}` : input.keyBase;
    const exists = state.stamps.some(
      (stamp) => stamp.restaurantId === input.restaurantId && stamp.key === key,
    );
    if (exists) continue;
    created.push({
      id: `stamp-${crypto.randomUUID()}`,
      restaurantId: input.restaurantId,
      membershipId: input.membershipId,
      staffId: input.staffId ?? null,
      key,
      createdAt: at,
      status: "valid",
      reason: input.reason,
    });
  }
  if (created.length === 0) return { granted: 0, stampIds: [], rewardIds: [] };

  let stampsCurrent = membership.stampsCurrent + created.length;
  const rewardIds: string[] = [];
  while (stampsCurrent >= restaurant.stampsRequired) {
    rewardIds.push(`reward-${crypto.randomUUID()}`);
    stampsCurrent -= restaurant.stampsRequired;
  }
  const rewards = rewardIds.map((id) => ({
    id,
    restaurantId: input.restaurantId,
    membershipId: input.membershipId,
    description: restaurant.rewardDescription,
    earnedAt: at,
    stampId: created[created.length - 1]!.id,
  }));

  updateDemo((current) => ({
    ...current,
    stamps: [...current.stamps, ...created],
    rewards: [...current.rewards, ...rewards],
    memberships: current.memberships.map((item) =>
      item.id === input.membershipId
        ? {
            ...item,
            stampsCurrent,
            stampsTotal: item.stampsTotal + created.length,
            lastVisitAt: item.lastVisitAt,
          }
        : item,
    ),
  }));

  return { granted: created.length, stampIds: created.map((stamp) => stamp.id), rewardIds };
}

export interface GrantResult {
  granted: number;
  stampIds: string[];
  rewardIds: string[];
}

const DAY = 86400000;

/** Number of valid visits (normal stamps only) in the trailing window. */
export function visitsInWindow(
  state: ReturnType<typeof demoRepo.read>,
  membershipId: string,
  days: number,
): number {
  const cutoff = state.now - days * DAY;
  return state.stamps.filter(
    (stamp) =>
      stamp.membershipId === membershipId &&
      stamp.status === "valid" &&
      (stamp.reason ?? "visit") === "visit" &&
      new Date(stamp.createdAt).getTime() >= cutoff,
  ).length;
}

/** Total valid visits, all time (used for spin earning). */
export function allVisits(state: ReturnType<typeof demoRepo.read>, membershipId: string): number {
  return state.stamps.filter(
    (stamp) =>
      stamp.membershipId === membershipId &&
      stamp.status === "valid" &&
      (stamp.reason ?? "visit") === "visit",
  ).length;
}
