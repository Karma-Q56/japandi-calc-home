// Runs after a stamp is recorded at the till. Later phases add their reward
// checks here (challenges, referrals, spins, tiers and birthdays). Each hook
// must be safe to run on every visit and must never throw into the till.
//
// Phase D12a adds no hooks: stamp card rewards are created inside record_stamp()
// (see db/migrations/0016_reward_types_dev.sql).

export type AfterVisitContext = {
  restaurantId: string;
  membershipId: string;
  staffId: string;
  result: string;
};

export type AfterVisitHook = (context: AfterVisitContext) => Promise<void>;

export const visitHooks: AfterVisitHook[] = [
  async ({ restaurantId, membershipId }) => {
    const { latestVisitStampId, applyVisitBonuses } = await import("./live-tools");
    const stampId = await latestVisitStampId(restaurantId, membershipId);
    if (stampId) await applyVisitBonuses(restaurantId, membershipId, stampId);
  },
  async ({ restaurantId, membershipId }) => {
    const { applyChallengeHook } = await import("./live-challenges");
    await applyChallengeHook(restaurantId, membershipId);
  },
  async ({ restaurantId, membershipId }) => {
    const { rewardReferralFor } = await import("./live-referrals");
    await rewardReferralFor(restaurantId, membershipId);
  },
];

export type OrderHookContext = {
  restaurantId: string;
  membershipId: string;
  staffId: string;
  stampId: string;
};

export type OrderHook = (context: OrderHookContext) => Promise<void>;

/** Runs after a till order is saved (D13c). Phase D12f adds the "Try this dish" check here. */
export const orderHooks: OrderHook[] = [];

/** Runs every order hook. A failing hook is reported to the console, not to the guest. */
export async function runOrderHooks(context: OrderHookContext): Promise<void> {
  for (const hook of orderHooks) {
    try {
      await hook(context);
    } catch (error) {
      console.error("order hook failed", error);
    }
  }
}

/** Runs every hook. A failing hook is reported to the console, not to the guest. */
export async function runAfterVisitHooks(context: AfterVisitContext): Promise<void> {
  for (const hook of visitHooks) {
    try {
      await hook(context);
    } catch (error) {
      console.error("after-visit hook failed", error);
    }
  }
}
