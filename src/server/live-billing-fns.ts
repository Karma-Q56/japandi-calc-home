import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the "Plan and billing" screen (D21).
// The restaurant comes from the server session, never from the browser.

/** Plan, usage, payments and invoices for the signed-in owner. */
export const getBillingFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getLiveBilling }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-billing"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return getLiveBilling(viewer);
});

/** Starts a PayFast checkout for the plan or a top up. The server sets every amount. */
export const startPaymentFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.enum(["subscription", "topup"]),
      topupCents: z.number().int().optional(),
      planName: z.enum(["Starter", "Growth"]).optional(),
      origin: z.string().url(),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { startLivePayment }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-billing"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    const origin = new URL(data.origin).origin;
    const request = data.kind === "topup"
      ? { kind: "topup" as const, topupCents: data.topupCents ?? 0 }
      : { kind: "subscription" as const, planName: data.planName ?? "" };
    return startLivePayment(viewer, request, origin);
  });
