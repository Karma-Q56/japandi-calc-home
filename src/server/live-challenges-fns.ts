import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for challenges and referrals (D12c).
// The restaurant comes from the server session, never from the browser.

const challengeInput = z.object({
  title: z.string().max(200),
  kind: z.enum(["visits", "quiet_days", "try_item"]),
  menuItemId: z.string().uuid().nullable(),
  menuSectionId: z.string().uuid().nullable(),
  targetName: z.string().max(120),
  visits: z.number().int().min(0).max(100),
  windowDays: z.number().int().min(0).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  startHour: z.number().int().min(0).max(23).nullable(),
  endHour: z.number().int().min(1).max(24).nullable(),
  rewardType: z.enum(["stamps", "free_item", "percent_off", "amount_off"]),
  bonusStamps: z.number().int().min(0).max(5),
  rewardItem: z.string().max(120),
  percentOff: z.number().int().min(0).max(100).nullable(),
  amountOffCents: z.number().int().min(0).nullable(),
  validDays: z.number().int().min(0).max(365).nullable(),
  active: z.boolean(),
});

const referralInput = z.object({
  enabled: z.boolean(),
  limitPerMonth: z.number().int().min(0).max(20),
  referrerRewardType: z.enum(["stamps", "free_item", "percent_off", "amount_off"]),
  referrerRewardItem: z.string().max(120),
  referrerPercentOff: z.number().int().min(0).max(100).nullable(),
  referrerAmountOffCents: z.number().int().min(0).nullable(),
  friendRewardType: z.enum(["stamps", "free_item", "percent_off", "amount_off"]),
  friendRewardItem: z.string().max(120),
  friendPercentOff: z.number().int().min(0).max(100).nullable(),
  friendAmountOffCents: z.number().int().min(0).nullable(),
  validDays: z.number().int().min(0).max(365).nullable(),
});

/** Read the live challenges for the signed-in owner or manager. */
export const getChallengesFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listChallenges }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-challenges"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return listChallenges(viewer);
});

/** Create or update a live challenge with validation. */
export const saveChallengeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid().nullable(), input: challengeInput }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveChallenge }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-challenges"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveChallenge(viewer, data.id, data.input);
  });

/**
 * The signed-in guest's challenges and bring-a-friend code for one restaurant card.
 * The membership comes from the session and the slug, never from the browser.
 */
export const getGuestExtrasFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getRepos }, { listGuestChallenges }, { referralCodeFor }] = await Promise.all([
      import("./auth-viewer"),
      import("./repos"),
      import("./live-challenges"),
      import("./live-referrals"),
    ]);
    const viewer = await readViewer();
    if (!viewer || viewer.role !== "guest" || !viewer.customerId) return null;
    const { repos } = getRepos({
      DATA_MODE: process.env["DATA_MODE"],
      DATABASE_URL: process.env["DATABASE_URL"],
    });
    const card = await repos.getCard(data.slug, viewer.customerId);
    if (!card) return null;
    const restaurantId = card.restaurant.id;
    const membershipId = card.membership.id;
    const [challenges, referralCode] = await Promise.all([
      listGuestChallenges(restaurantId, membershipId),
      referralCodeFor(restaurantId, membershipId),
    ]);
    return { challenges, referralCode, restaurantName: card.restaurant.name };
  });

/** Read the live referral settings for the signed-in owner or manager. */
export const getReferralSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadReferralSettings }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-referrals"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadReferralSettings(viewer);
});

/** Save the live referral settings with validation. */
export const saveReferralSettingsFn = createServerFn({ method: "POST" })
  .validator(referralInput)
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveReferralSettings }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-referrals"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveReferralSettings(viewer, data);
  });
