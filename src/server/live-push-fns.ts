import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for web push (D17). The guest comes from the server session.

const subscribeInput = z.object({
  endpoint: z.string().max(500),
  keys: z.object({
    p256dh: z.string().max(200),
    auth: z.string().max(100),
  }),
});

/** Save this browser's push subscription for the signed in guest. */
export const subscribePushFn = createServerFn({ method: "POST" })
  .validator(subscribeInput)
  .handler(async ({ data }) => {
    const [{ readViewer }, { subscribePush }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-push"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return subscribePush(viewer, {
      endpoint: data.endpoint,
      keys: data.keys,
      userAgent: null,
    });
  });

/** Remove this browser's push subscription for the signed in guest. */
export const unsubscribePushFn = createServerFn({ method: "POST" })
  .validator(z.object({ endpoint: z.string().max(500) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { unsubscribePush }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-push"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return unsubscribePush(viewer, data.endpoint);
  });

/** Whether this browser is already subscribed for the signed in guest. */
export const getPushStateFn = createServerFn({ method: "POST" })
  .validator(z.object({ endpoint: z.string().max(500).nullable() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getPushState }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-push"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { subscribed: false };
    return getPushState(viewer, data.endpoint);
  });
