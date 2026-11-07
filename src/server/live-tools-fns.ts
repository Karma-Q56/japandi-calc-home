import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the bonus rules and guest tiers (D12b).
// The restaurant comes from the server session, never from the browser.

/** Read the live loyalty tools for the signed-in owner or manager. */
export const getLoyaltyToolsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadTools }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-tools"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadTools(viewer);
});

/** Save the live loyalty tools with validation and an audit event. */
export const updateLoyaltyToolsFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      doubleStampEnabled: z.boolean(),
      doubleStampWeekday: z.number().int().min(0).max(6),
      streakEnabled: z.boolean(),
      streakWeeks: z.number().int().min(2).max(12),
      streakWeeklyVisits: z.number().int().min(1).max(7),
      streakBonusStamps: z.number().int().min(1).max(5),
      toolStampBudget: z.number().int().min(0).max(2000),
      birthdayReward: z.boolean(),
      birthdayRewardKind: z.enum(["stamp", "freeItem"]),
      birthdayRewardItem: z.string().max(80),
      mysteryEveryVisits: z.number().int().min(0).max(50),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveTools }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-tools"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveTools(viewer, data);
  });

/** Read the live guest tier thresholds. */
export const getGuestTiersFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadTiers }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-tools"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadTiers(viewer);
});

/** Save the live guest tier thresholds with validation and an audit event. */
export const updateGuestTiersFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      regular: z.number().int().min(1).max(100),
      vip: z.number().int().min(2).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveTiers }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-tools"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveTiers(viewer, data);
  });
