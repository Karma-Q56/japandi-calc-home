import { demoRepo, updateDemo } from "@/data/repo";
import type {
  MenuItem,
  Referral,
  ReferralConfig,
  Restaurant,
  Special,
  StampEvent,
} from "@/data/types";
import { failure, success, type ApiResult } from "./demo";
import { logAudit, requireScope } from "./audit";
import { issueTargetedCodes } from "./specials";

const DAY = 86400000;

/** Bring a friend settings the owner can change. Off by default. */
export const DEFAULT_REFERRAL: ReferralConfig = {
  enabled: false,
  rewardKind: "stamp",
  rewardItem: "",
  limitPerMemberPerMonth: 2,
};

export function referralConfigFor(restaurantId: string): ReferralConfig {
  const restaurant = demoRepo.read().restaurants.find((item) => item.id === restaurantId);
  return { ...DEFAULT_REFERRAL, ...(restaurant?.referral ?? {}) };
}

/** A guest's own share code and link, created the first time they share. */
export function myReferralCode(membershipId: string): ApiResult<{ code: string; slug: string }> {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!membership) return failure("NOT_FOUND", "Membership not found.");
  const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  if (!membership.referralCode) {
    const code = makeReferralCode();
    updateDemo((current) => ({
      ...current,
      memberships: current.memberships.map((item) =>
        item.id === membershipId ? { ...item, referralCode: code } : item,
      ),
    }));
    return success({ code, slug: restaurant.slug });
  }
  return success({ code: membership.referralCode, slug: restaurant.slug });
}

function makeReferralCode(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += letters[Math.floor(Math.random() * letters.length)]!;
  }
  return `PAL${code}`;
}

/**
 * Called when a guest joins through a friend's share code. Records the
 * referral as pending, or rejected when the friend is really the referrer
 * or the phone number matches.
 */
export function recordJoinReferral(input: {
  restaurantId: string;
  referrerCode: string;
  friendMembershipId: string;
}) {
  const state = demoRepo.read();
  const code = input.referrerCode.trim().toUpperCase();
  if (!code) return;
  const referrer = state.memberships.find(
    (item) => item.referralCode?.toUpperCase() === code && item.restaurantId === input.restaurantId,
  );
  if (!referrer) return;
  const now = new Date(state.now).toISOString();
  const base = {
    restaurantId: input.restaurantId,
    referrerMembershipId: referrer.id,
    friendMembershipId: input.friendMembershipId,
    referrerCode: code,
    createdAt: now,
  };
  const record = (row: Omit<Referral, "id">) => {
    updateDemo((current) => ({
      ...current,
      referrals: [...current.referrals, { id: `referral-${crypto.randomUUID()}`, ...row }],
    }));
  };
  if (referrer.id === input.friendMembershipId) {
    record({
      ...base,
      status: "rejected",
      rejectReason: "A guest cannot refer themselves.",
    });
    return;
  }
  const referrerCustomer = state.customers.find((item) => item.id === referrer.customerId);
  const friend = state.memberships.find((item) => item.id === input.friendMembershipId);
  const friendCustomer = state.customers.find((item) => item.id === friend?.customerId);
  if (
    referrerCustomer &&
    friendCustomer &&
    referrerCustomer.phoneE164.replace(/\D/g, "") === friendCustomer.phoneE164.replace(/\D/g, "")
  ) {
    record({
      ...base,
      status: "rejected",
      rejectReason: "The friend's phone matches the referrer's.",
    });
    return;
  }
  const duplicate = state.referrals.some(
    (item) =>
      item.referrerMembershipId === referrer.id &&
      item.friendMembershipId === input.friendMembershipId &&
      item.status !== "rejected",
  );
  if (duplicate) return;
  record({ ...base, status: "pending" });
}

/**
 * Called after a stamp. The reward only lands on the friend's first
 * stamped visit, and only when the owner has bring a friend switched on.
 */
export function awardReferralForFirstStamp(membershipId: string) {
  const state = demoRepo.read();
  const referral = state.referrals.find(
    (item) => item.friendMembershipId === membershipId && item.status === "pending",
  );
  if (!referral) return;
  const config = referralConfigFor(referral.restaurantId);
  if (!config.enabled) return;
  // Welcome stamps do not count as a stamped visit; the first real one does.
  const visitCount = state.stamps.filter(
    (stamp) =>
      stamp.membershipId === membershipId && stamp.status === "valid" && stamp.reason === "visit",
  ).length;
  if (visitCount !== 1) return;
  rewardReferral(referral, config);
}

function rewardReferral(referral: Referral, config: ReferralConfig) {
  const state = demoRepo.read();
  const monthKey = new Date(state.now).toISOString().slice(0, 7);
  const usedThisMonth = state.referrals.filter(
    (item) =>
      item.referrerMembershipId === referral.referrerMembershipId &&
      item.status === "rewarded" &&
      item.rewardedAt?.slice(0, 7) === monthKey,
  ).length;
  if (usedThisMonth >= config.limitPerMemberPerMonth) {
    setReferralStatus(referral.id, "rejected", "The referrer's monthly limit is used up.");
    return;
  }
  const now = new Date(state.now).toISOString();
  if (config.rewardKind === "stamp") {
    giveBonusStamp(referral.referrerMembershipId, `referral-${referral.id}-referrer`, now);
    giveBonusStamp(referral.friendMembershipId, `referral-${referral.id}-friend`, now);
    setReferralStatus(referral.id, "rewarded");
    logAudit({
      actor: "referral",
      action: "referral_rewarded",
      restaurantId: referral.restaurantId,
      object: referral.id,
    });
    return;
  }
  issueFreeItemReward(referral, config, now);
  setReferralStatus(referral.id, "rewarded");
  logAudit({
    actor: "referral",
    action: "referral_rewarded",
    restaurantId: referral.restaurantId,
    object: referral.id,
  });
}

/** The free item reward: one single use personal offer per guest. */
function issueFreeItemReward(referral: Referral, config: ReferralConfig, now: string) {
  const special: Special = {
    id: `special-${crypto.randomUUID()}`,
    restaurantId: referral.restaurantId,
    title: `Bring a friend: free ${config.rewardItem.toLowerCase()}`,
    body: "Your bring a friend reward. Show this code at the till.",
    startsAt: now,
    endsAt: new Date(demoRepo.read().now + 30 * DAY).toISOString(),
    active: true,
    kind: "targeted",
    minTier: null,
    createdAt: now,
  };
  const specialId = special.id;
  updateDemo((current) => ({
    ...current,
    specials: [...current.specials, special],
    restaurants: current.restaurants.map((item) =>
      item.id === referral.restaurantId && !item.specialIds.includes(specialId)
        ? { ...item, specialIds: [...item.specialIds, specialId] }
        : item,
    ),
  }));
  issueTargetedCodes(specialId, [referral.referrerMembershipId, referral.friendMembershipId]);
}

/** One bonus stamp each, with the normal reward wrap on a full card. */
function giveBonusStamp(membershipId: string, key: string, now: string) {
  updateDemo((current) => {
    const membership = current.memberships.find((item) => item.id === membershipId);
    const restaurant = current.restaurants.find((item) => item.id === membership?.restaurantId);
    if (!membership || !restaurant || current.stamps.some((stamp) => stamp.key === key)) {
      return current;
    }
    const stampId = `stamp-${crypto.randomUUID()}`;
    const stamp: StampEvent = {
      id: stampId,
      restaurantId: membership.restaurantId,
      membershipId,
      staffId: null,
      key,
      createdAt: now,
      status: "valid" as const,
      reason: "bonus" as const,
    };
    let stampsCurrent = membership.stampsCurrent + 1;
    let rewards = current.rewards;
    if (stampsCurrent >= restaurant.stampsRequired) {
      rewards = [
        ...rewards,
        {
          id: `reward-${crypto.randomUUID()}`,
          restaurantId: membership.restaurantId,
          membershipId,
          description: restaurant.rewardDescription,
          earnedAt: now,
          stampId,
        },
      ];
      stampsCurrent -= restaurant.stampsRequired;
    }
    return {
      ...current,
      stamps: [...current.stamps, stamp],
      rewards,
      memberships: current.memberships.map((item) =>
        item.id === membershipId
          ? { ...item, stampsCurrent, stampsTotal: item.stampsTotal + 1 }
          : item,
      ),
    };
  });
}

function setReferralStatus(id: string, status: Referral["status"], rejectReason?: string) {
  updateDemo((current) => ({
    ...current,
    referrals: current.referrals.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            ...(rejectReason !== undefined ? { rejectReason } : {}),
            ...(status === "rewarded" ? { rewardedAt: new Date(current.now).toISOString() } : {}),
          }
        : item,
    ),
  }));
}

/** Settings the owner reads on the bring a friend page. */
export function referralSettings(_restaurantId: string) {
  return success(referralConfigFor(_restaurantId));
}

export function updateReferralSettings(input: {
  restaurantId: string;
  session: { role: string; restaurantId?: string | undefined };
  enabled: boolean;
  rewardKind: ReferralConfig["rewardKind"];
  rewardItem: string;
  limitPerMemberPerMonth: number;
}): ApiResult<ReferralConfig> {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  if (input.rewardKind === "freeItem" && !input.rewardItem.trim()) {
    return failure("INVALID", "Choose the free item both guests get.");
  }
  if (input.limitPerMemberPerMonth < 0 || input.limitPerMemberPerMonth > 20) {
    return failure("INVALID", "The monthly limit per guest must be between 0 and 20.");
  }
  const config: ReferralConfig = {
    enabled: input.enabled,
    rewardKind: input.rewardKind,
    rewardItem: input.rewardItem.trim(),
    limitPerMemberPerMonth: Math.round(input.limitPerMemberPerMonth),
  };
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((item) =>
      item.id === input.restaurantId ? { ...item, referral: config } : item,
    ),
  }));
  logAudit({
    actor: "owner",
    action: "referral_settings",
    restaurantId: input.restaurantId,
    object: "referral-config",
  });
  return success(config);
}

/** What the owner sees on the bring a friend page. */
export interface ReferralOverview {
  config: ReferralConfig;
  referrals: Array<{
    id: string;
    status: Referral["status"];
    referrerName: string;
    friendName: string;
    createdAt: string;
    rewardedAt?: string;
    rejectReason?: string;
  }>;
  rewardedThisMonth: number;
  estimateText: string;
  guestsText: string;
  menuItemNames: string[];
}

export function referralOverview(input: {
  restaurantId: string;
  session: { role: string; restaurantId?: string | undefined };
}): ApiResult<ReferralOverview> {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const config = referralConfigFor(input.restaurantId);
  const monthKey = new Date(state.now).toISOString().slice(0, 7);
  const nameOf = (membershipId: string) => {
    const membership = state.memberships.find((item) => item.id === membershipId);
    const customer = state.customers.find((item) => item.id === membership?.customerId);
    return customer?.name.split(" ")[0] ?? "Removed guest";
  };
  const referrals = state.referrals
    .filter((item) => item.restaurantId === input.restaurantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      id: item.id,
      status: item.status,
      referrerName: nameOf(item.referrerMembershipId),
      friendName: nameOf(item.friendMembershipId),
      createdAt: item.createdAt,
      ...(item.rewardedAt ? { rewardedAt: item.rewardedAt } : {}),
      ...(item.rejectReason ? { rejectReason: item.rejectReason } : {}),
    }));
  const rewardedThisMonth = state.referrals.filter(
    (item) =>
      item.restaurantId === input.restaurantId &&
      item.status === "rewarded" &&
      item.rewardedAt?.slice(0, 7) === monthKey,
  ).length;
  const menuItems = state.items.filter(
    (item) => item.restaurantId === input.restaurantId,
  );
  const pricedItem = menuItems.find((item) => item.name === config.rewardItem);
  const pairValueCents = pricedItem ? pricedItem.priceCents * 2 : 0;
  const estimateText = !config.enabled
    ? "Bring a friend is off, so it costs nothing right now."
    : config.rewardKind === "stamp"
      ? "No cash cost. Each pair costs one bonus stamp on top of their visit stamps."
      : `About R${(pairValueCents / 100).toFixed(2)} per pair, from the menu price of the free item for each guest.`;
  const rewardText =
    config.rewardKind === "stamp"
      ? "a bonus stamp each"
      : `a free ${(config.rewardItem || "menu item").toLowerCase()} each`;
  const guestsText = `Your guest shares their link. Their friend joins and gets their first stamp, and both guests get ${rewardText}.`;
  return success({
    config,
    referrals,
    rewardedThisMonth,
    estimateText,
    guestsText,
    menuItemNames: menuItems.map((item) => item.name),
  });
}

/** What the two guests see, used for the preview step. */
export function referralGuestPreview(input: {
  restaurant: Pick<Restaurant, "id" | "name">;
  config: ReferralConfig;
}): { referrerText: string; friendText: string } {
  const reward =
    input.config.rewardKind === "stamp"
      ? "a bonus stamp"
      : `a free ${(input.config.rewardItem || "treat").toLowerCase()}`;
  return {
    referrerText:
      `You shared ${input.restaurant.name}. When your friend gets their first stamp, you both get ${reward}.`,
    friendText:
      `${input.restaurant.name} welcomes you. Join through your friend's link and your first visit gets you both ${reward}.`,
  };
}
