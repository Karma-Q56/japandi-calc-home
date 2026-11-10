import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for creating campaigns (D15).
// The restaurant comes from the server session, never from the browser.

const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("everyone") }),
  z.object({ type: z.literal("new"), days: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal("lapsed30"), days: z.number().int().min(1).max(730) }),
  z.object({ type: z.literal("close_to_reward"), remaining: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("weekday"), weekday: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("birthday_month"), month: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal("saved_list"), listId: z.string().uuid() }),
]);

/** Count the guests an audience reaches, on the server. */
export const countRecipientsFn = createServerFn({ method: "POST" })
  .validator(z.object({ audience: audienceSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { countCampaignRecipients }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-campaign-create"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return countCampaignRecipients(viewer, data.audience);
  });

/** Create a campaign and reserve its estimated cost. */
export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().max(200),
      body: z.string().max(1000),
      code: z.string().max(20),
      audience: audienceSchema,
      scheduledAt: z.string().max(40),
      segments: z.number().int().min(0).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { createLiveCampaign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-campaign-create"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return createLiveCampaign(viewer, data);
  });
