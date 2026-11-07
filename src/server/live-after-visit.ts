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
];

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
