import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
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

/** The banner every owner screen shows: nothing, the grace warning, or campaigns paused. */
export const getBillingBannerFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getLiveBillingBanner }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-billing"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return { kind: "none" as const, graceEndsAt: null };
  return getLiveBillingBanner(viewer);
});

/** The public address of this site, read from the request on the server (never from the browser). */
function requestOrigin(): string | null {
  const host = getRequestHeaders().get("host")?.trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return `${local ? "http" : "https"}://${host}`;
}

/** Starts a PayFast checkout for the plan or a top up. The server sets every amount. */
export const startPaymentFn = createServerFn({ method: "POST" })
  .validator(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("topup"), topupCents: z.number().int() }),
      z.object({ kind: z.literal("subscription"), planName: z.enum(["Starter", "Growth"]) }),
    ]),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { startLivePayment }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-billing"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    const origin = requestOrigin();
    if (!origin) return { ok: false as const, message: "We could not start the payment. Try again." };
    return startLivePayment(viewer, data, origin);
  });
