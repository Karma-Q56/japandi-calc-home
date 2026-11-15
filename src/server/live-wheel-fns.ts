import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the spin wheel (D12d). Owner calls use the signed-in owner or manager; guest calls use the
// signed-in guest and the card for the restaurant slug. Nothing about who or which restaurant comes from the browser.

const prizeSchema = z.object({
  label: z.string().max(200),
  weight: z.number(),
  type: z.enum(["nothing", "stamps", "free_item", "percent_off", "amount_off"]),
  stamps: z.number().nullable(),
  percentOff: z.number().nullable(),
  amountOffCents: z.number().nullable(),
  valueCents: z.number(),
  validDays: z.number().nullable(),
  weeklyCap: z.number().nullable(),
});

const settingsSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["join", "earned", "reward_decider"]),
  earnEvery: z.number(),
  floorCents: z.number(),
  prizes: z.array(prizeSchema).max(20),
});

/** The saved wheel of the signed-in restaurant. */
export const getOwnerWheelFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadOwnerWheel }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-wheel"),
  ]);
  return loadOwnerWheel(await readViewer());
});

export const saveOwnerWheelFn = createServerFn({ method: "POST" })
  .validator(settingsSchema)
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveOwnerWheel }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-wheel"),
    ]);
    return saveOwnerWheel(await readViewer(), data);
  });

export const testOwnerWheelFn = createServerFn({ method: "POST" }).handler(async () => {
  const [{ readViewer }, { testOwnerWheel }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-wheel"),
  ]);
  return testOwnerWheel(await readViewer());
});

async function guestMembership(slug: string) {
  const [{ readViewer }, { getRepos }] = await Promise.all([import("./auth-viewer"), import("./repos")]);
  const viewer = await readViewer();
  if (!viewer || viewer.role !== "guest" || !viewer.customerId) return null;
  const { repos } = getRepos({
    DATA_MODE: process.env["DATA_MODE"],
    DATABASE_URL: process.env["DATABASE_URL"],
  });
  const card = await repos.getCard(slug, viewer.customerId);
  if (!card) return null;
  return { customerId: viewer.customerId, membershipId: card.membership.id };
}

/** The signed-in guest's spin state for one restaurant card. */
export const getGuestSpinFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const found = await guestMembership(data.slug);
    if (!found) return null;
    const { loadGuestSpin } = await import("./live-wheel");
    return loadGuestSpin(found.customerId, found.membershipId);
  });

/** The guest spins. The spin id is made by the browser once per spin, so a retry never pays twice. */
export const guestSpinFn = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1).max(120), spinId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const found = await guestMembership(data.slug);
    if (!found) return { ok: false as const, message: "Sign in to spin." };
    const { guestSpin } = await import("./live-wheel");
    return guestSpin(found.customerId, found.membershipId, data.spinId);
  });
