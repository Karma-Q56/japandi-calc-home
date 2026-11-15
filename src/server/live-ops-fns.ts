import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the operator console (D18). The operator comes from the server session.

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(200);

/** Pause, resume or close a restaurant. */
export const setRestaurantStatusFn = createServerFn({ method: "POST" })
  .validator(z.object({ restaurantId: uuid, status: z.enum(["draft", "active", "paused", "closed"]), reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setRestaurantStatus }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setRestaurantStatus(viewer, data.restaurantId, data.status, data.reason);
  });

/** Change a restaurant's plan. */
export const setRestaurantPlanFn = createServerFn({ method: "POST" })
  .validator(z.object({ restaurantId: uuid, plan: z.enum(["starter", "managed", "partner", "custom"]), reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setRestaurantPlan }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setRestaurantPlan(viewer, data.restaurantId, data.plan, data.reason);
  });

/** Add credit or correct it. The amount is whole cents; the reference stops a double add. */
export const addCreditFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      restaurantId: uuid,
      entryType: z.enum(["topup", "adjustment"]),
      amountCents: z.number().int().min(-10000000).max(10000000),
      reference: z.string().trim().min(8).max(80),
      reason,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { addCredit }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return addCredit(viewer, data);
  });

/** Approve or reject a campaign waiting for approval. */
export const decideCampaignFn = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: uuid, decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(200) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { decideCampaign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return decideCampaign(viewer, data.campaignId, data.decision, data.reason);
  });

/** Create a draft restaurant for an owner by email. */
export const createRestaurantForOwnerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ownerEmail: z.string().trim().email().max(254),
      name: z.string().trim().min(2).max(80),
      slug: z.string().trim().min(3).max(40),
      suburb: z.string().trim().max(80),
      city: z.string().trim().max(80),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { createRestaurantForOwner }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return createRestaurantForOwner(viewer, data);
  });
