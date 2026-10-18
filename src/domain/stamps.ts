import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { failure, success } from "./demo";
import { logAudit } from "./audit";

export type StampResult =
  | { result: "stamped"; stampId: string; stampsCurrent: number; rewardId: string | null }
  | { result: "too_soon"; stampsCurrent: number; nextAllowedAt: string }
  | { result: "not_a_member" }
  | { result: "duplicate_retry"; stampId: string; stampsCurrent: number };

export const UNDO_WINDOW_MS = 10 * 60 * 1000;

function scopeCheck(
  session: { role: string; restaurantId?: string | undefined },
  restaurantId: string,
) {
  if (session.role === "operator") return true;
  return (
    (session.role === "owner" || session.role === "staff") && session.restaurantId === restaurantId
  );
}

/** Pure computation over a state snapshot — same table as record_stamp. */
export function computeStamp(
  state: ReturnType<typeof demoRepo.read>,
  input: { restaurantId: string; membershipId: string; key: string },
): StampResult {
  const restaurant = state.restaurants.find((r) => r.id === input.restaurantId);
  const membership = state.memberships.find(
    (m) => m.id === input.membershipId && m.restaurantId === input.restaurantId,
  );
  if (!restaurant || !membership) return { result: "not_a_member" };
  const prior = state.stamps.find(
    (s) => s.restaurantId === input.restaurantId && s.key === input.key,
  );
  if (prior) {
    return {
      result: "duplicate_retry",
      stampId: prior.id,
      stampsCurrent: membership.stampsCurrent,
    };
  }
  const lastValid = state.stamps
    .filter((s) => s.membershipId === membership.id && s.status === "valid")
    .map((s) => new Date(s.createdAt).getTime())
    .sort((a, b) => b - a)[0];
  const windowMs = restaurant.visitWindowMinutes * 60 * 1000;
  if (lastValid !== undefined && lastValid > state.now - windowMs) {
    return {
      result: "too_soon",
      stampsCurrent: membership.stampsCurrent,
      nextAllowedAt: new Date(lastValid + windowMs).toISOString(),
    };
  }
  return { result: "stamped", stampId: "", stampsCurrent: -1, rewardId: null };
}

export function recordStamp(input: {
  restaurantId: string;
  membershipId: string;
  staffId: string;
  key: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  if (!scopeCheck(input.session, input.restaurantId)) {
    return failure("FORBIDDEN", "That member belongs to another restaurant.");
  }
  const state = demoRepo.read();
  const decided = computeStamp(state, input);
  if (decided.result !== "stamped") return success(decided);
  const restaurant = state.restaurants.find((r) => r.id === input.restaurantId)!;
  const membership = state.memberships.find((m) => m.id === input.membershipId)!;
  const now = new Date(state.now).toISOString();
  const stampId = `stamp-${crypto.randomUUID()}`;
  let stampsCurrent = membership.stampsCurrent + 1;
  let rewardId: string | null = null;
  updateDemo((current) => {
    const stamps = [
      ...current.stamps,
      {
        id: stampId,
        restaurantId: input.restaurantId,
        membershipId: input.membershipId,
        staffId: input.staffId,
        key: input.key,
        createdAt: now,
        status: "valid" as const,
      },
    ];
    let rewards = current.rewards;
    if (stampsCurrent >= restaurant.stampsRequired) {
      rewardId = `reward-${crypto.randomUUID()}`;
      const created = rewardId;
      rewards = [
        ...rewards,
        {
          id: created,
          restaurantId: input.restaurantId,
          membershipId: input.membershipId,
          description: restaurant.rewardDescription,
          earnedAt: now,
          stampId,
        },
      ];
      stampsCurrent -= restaurant.stampsRequired;
    }
    const memberships = current.memberships.map((m) =>
      m.id === input.membershipId
        ? {
            ...m,
            stampsCurrent,
            stampsTotal: m.stampsTotal + 1,
            lastVisitAt: now,
          }
        : m,
    );
    return { ...current, stamps, rewards, memberships };
  });
  logAudit({
    actor: input.staffId,
    action: "stamp",
    restaurantId: input.restaurantId,
    object: stampId,
  });
  return success({ result: "stamped", stampId, stampsCurrent, rewardId } as StampResult);
}

export function lookupMember(input: {
  restaurantId: string;
  code: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  if (!scopeCheck(input.session, input.restaurantId)) {
    return failure("FORBIDDEN", "That member belongs to another restaurant.");
  }
  const state = demoRepo.read();
  const raw = input.code.trim();
  const needle = raw.toUpperCase();
  const needleDigits = needle.replace(/\D/g, "");
  const customer = state.customers.find(
    (c) =>
      c.memberCode.toUpperCase() === needle ||
      c.qrToken === raw ||
      (needleDigits.length >= 4 && c.phoneE164.replace(/\D/g, "").endsWith(needleDigits)),
  );
  if (!customer) return failure("NOT_FOUND", "No member matches that code.");
  const membership = state.memberships.find(
    (m) => m.customerId === customer.id && m.restaurantId === input.restaurantId,
  );
  if (!membership) return failure("NOT_FOUND", "That member is not on this list.");
  const rewards = state.rewards.filter((r) => r.membershipId === membership.id && !r.redeemedAt);
  const campaigns = state.campaigns.filter((c) => c.restaurantId === input.restaurantId);
  return success({
    firstName: customer.name.split(" ")[0] ?? customer.name,
    membership,
    rewards,
    campaigns,
  });
}

export function undoStamp(input: {
  stampId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const state = demoRepo.read();
  const stamp = state.stamps.find((s) => s.id === input.stampId);
  if (!stamp || stamp.status !== "valid") {
    return failure("NOT_FOUND", "That stamp cannot be undone.");
  }
  if (!scopeCheck(input.session, stamp.restaurantId)) {
    return failure("FORBIDDEN", "That stamp belongs to another restaurant.");
  }
  const isOwner = input.session.role === "owner" || input.session.role === "operator";
  if (!isOwner && stamp.staffId !== input.actorId) {
    return failure("FORBIDDEN", "Only the staff member or an owner can undo.");
  }
  if (state.now - new Date(stamp.createdAt).getTime() > UNDO_WINDOW_MS) {
    return failure("INVALID", "Undo is only allowed within 10 minutes.");
  }
  const membership = state.memberships.find((m) => m.id === stamp.membershipId)!;
  const restaurant = state.restaurants.find((r) => r.id === stamp.restaurantId)!;
  const reward = state.rewards.find((r) => r.stampId === stamp.id && !r.redeemedAt);
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    stamps: current.stamps.map((s) =>
      s.id === stamp.id
        ? { ...s, status: "undone" as const, undoneAt: now, undoneBy: input.actorId }
        : s,
    ),
    memberships: current.memberships.map((m) =>
      m.id === membership.id
        ? {
            ...m,
            stampsCurrent: Math.max(
              0,
              m.stampsCurrent - 1 + (reward ? restaurant.stampsRequired : 0),
            ),
            stampsTotal: Math.max(0, m.stampsTotal - 1),
            lastVisitAt: m.lastVisitAt === stamp.createdAt ? null : m.lastVisitAt,
          }
        : m,
    ),
    rewards: reward ? current.rewards.filter((r) => r.id !== reward.id) : current.rewards,
  }));
  logAudit({
    actor: input.actorId,
    action: "undo",
    restaurantId: stamp.restaurantId,
    object: stamp.id,
  });
  return success({ undone: true, voidedRewardId: reward?.id ?? null });
}

export function redeemReward(input: {
  rewardId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const state = demoRepo.read();
  const reward = state.rewards.find((r) => r.id === input.rewardId);
  if (!reward || reward.redeemedAt) {
    return failure("NOT_FOUND", "That reward is not available.");
  }
  if (!scopeCheck(input.session, reward.restaurantId)) {
    return failure("FORBIDDEN", "That reward belongs to another restaurant.");
  }
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    rewards: current.rewards.map((r) =>
      r.id === reward.id ? { ...r, redeemedAt: now, redeemedBy: input.actorId } : r,
    ),
    redemptions: [
      ...current.redemptions,
      {
        id: `redemption-${crypto.randomUUID()}`,
        restaurantId: reward.restaurantId,
        membershipId: reward.membershipId,
        rewardId: reward.id,
        redeemedAt: now,
        redeemedBy: input.actorId,
        kind: "reward" as const,
      },
    ],
  }));
  logAudit({
    actor: input.actorId,
    action: "redeem",
    restaurantId: reward.restaurantId,
    object: reward.id,
  });
  return success({ redeemed: true });
}

export function redeemCampaignCode(input: {
  code: string;
  membershipId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const state = demoRepo.read();
  const campaign = state.campaigns.find(
    (c) => c.code.toUpperCase() === input.code.trim().toUpperCase(),
  );
  if (!campaign) return failure("NOT_FOUND", "That offer code was not found.");
  if (campaign.status !== "sent" || !campaign.sentAt)
    return failure("INVALID", "That offer is not active yet.");
  if (!scopeCheck(input.session, campaign.restaurantId)) {
    return failure("FORBIDDEN", "That offer belongs to another restaurant.");
  }
  const membership = state.memberships.find((m) => m.id === input.membershipId);
  if (!membership || membership.restaurantId !== campaign.restaurantId) {
    return failure("NOT_FOUND", "That guest was not a recipient.");
  }
  if (state.now - new Date(campaign.sentAt).getTime() > 30 * 86400000) {
    return failure("INVALID", "That offer has expired.");
  }
  const already = state.redemptions.some(
    (r) => r.kind === "campaign" && r.rewardId === campaign.id && r.membershipId === membership.id,
  );
  if (already) return failure("INVALID", "That offer was already redeemed.");
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    redemptions: [
      ...current.redemptions,
      {
        id: `redemption-${crypto.randomUUID()}`,
        restaurantId: campaign.restaurantId,
        membershipId: membership.id,
        rewardId: campaign.id,
        redeemedAt: now,
        redeemedBy: input.actorId,
        kind: "campaign" as const,
        code: campaign.code,
      },
    ],
  }));
  logAudit({
    actor: input.actorId,
    action: "redeem",
    restaurantId: campaign.restaurantId,
    object: campaign.id,
  });
  let stampAward: StampResult | null = null;
  if (campaign.awardStamp !== false) {
    const awarded = recordStamp({
      restaurantId: campaign.restaurantId,
      membershipId: membership.id,
      staffId: input.actorId,
      key: `campaign-${campaign.id}-${membership.id}`,
      session: input.session,
    });
    stampAward = awarded.ok ? awarded.data : null;
  }
  return success({ redeemed: true, stampAward });
}
