import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the spin wheel (D12d).
// The restaurant and membership come from the server session, never from the browser.

const prizeInput = z.object({
  label: z.string().max(80),
  weight: z.number().int().min(0).max(1000),
  rewardType: z.enum(["stamps", "free_item", "percent_off", "amount_off"]),
  bonusStamps: z.number().int().min(0).max(5).nullable(),
  rewardItem: z.string().max(80),
  percentOff: z.number().int().min(0).max(100).nullable(),
  amountOffCents: z.number().int().min(0).nullable(),
  validDays: z.number().int().min(0).max(365).nullable(),
  valueCents: z.number().int().min(0).max(100000000),
  weeklyCap: z.number().int().min(1).max(10000).nullable(),
});

const wheelInput = z.object({
  enabled: z.boolean(),
  mode: z.enum(["join", "earned", "reward_decider"]),
  earnEveryVisits: z.number().int().min(1).max(100),
  weeklyBudgetCents: z.number().int().min(0).max(100000000).nullable(),
  prizes: z.array(prizeInput).max(9),
});

/** The owner's wheel. Null for anyone who cannot manage the restaurant. */
export const getWheelFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getOwnerWheel }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-wheel"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return getOwnerWheel(viewer);
});

/** Saves the owner's wheel. Validation runs on the server as well as in the form. */
export const saveWheelFn = createServerFn({ method: "POST" })
  .validator(wheelInput)
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveOwnerWheel }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-wheel"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveOwnerWheel(viewer, data);
  });

/** The signed-in guest's spins left for one restaurant card. */
export const getGuestWheelFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getRepos }, { guestSpinState }] = await Promise.all([
      import("./auth-viewer"),
      import("./repos"),
      import("./live-wheel"),
    ]);
    const viewer = await readViewer();
    if (!viewer || viewer.role !== "guest" || !viewer.customerId) return null;
    const { repos } = getRepos({
      DATA_MODE: process.env["DATA_MODE"],
      DATABASE_URL: process.env["DATABASE_URL"],
    });
    const card = await repos.getCard(data.slug, viewer.customerId);
    if (!card) return null;
    return guestSpinState(card.restaurant.id, card.membership.id);
  });

/** Spins the guest's wheel once. The spin key makes a repeated tap pay nothing extra. */
export const spinWheelFn = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1).max(120), spinKey: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getRepos }, { spinGuestWheel }] = await Promise.all([
      import("./auth-viewer"),
      import("./repos"),
      import("./live-wheel"),
    ]);
    const viewer = await readViewer();
    if (!viewer || viewer.role !== "guest" || !viewer.customerId) {
      return { ok: false as const, code: "not_a_member" };
    }
    const { repos } = getRepos({
      DATA_MODE: process.env["DATA_MODE"],
      DATABASE_URL: process.env["DATABASE_URL"],
    });
    const card = await repos.getCard(data.slug, viewer.customerId);
    if (!card) return { ok: false as const, code: "not_a_member" };
    return spinGuestWheel(card.restaurant.id, card.membership.id, data.spinKey);
  });
