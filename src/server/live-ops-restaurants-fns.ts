import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the operator console, part 1 (D23). The operator comes from the server session.

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(300);

/** Restaurant list with search and status filter. */
export const listRestaurantsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      search: z.string().trim().max(80).default(""),
      status: z.enum(["", "draft", "active", "paused", "closed"]).default(""),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { listRestaurantsLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listRestaurantsLive(viewer, data);
  });

/** One restaurant's detail. */
export const restaurantDetailFn = createServerFn({ method: "GET" })
  .validator(z.object({ restaurantId: uuid }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { restaurantDetailLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return restaurantDetailLive(viewer, data.restaurantId);
  });

/** Top ups waiting for a manual EFT check. */
export const pendingTopupsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { pendingTopupsLive }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-ops-restaurants"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return { ok: false as const, message: "Sign in again." };
  return pendingTopupsLive(viewer);
});

/** Invoices across restaurants. */
export const listInvoicesFn = createServerFn({ method: "GET" })
  .validator(z.object({ status: z.enum(["", "open", "paid", "void"]).default(""), limit: z.number().int().min(1).max(500).default(100) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { listInvoicesLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listInvoicesLive(viewer, data);
  });

/** Confirm a manual EFT top up. */
export const confirmTopupFn = createServerFn({ method: "POST" })
  .validator(z.object({ paymentId: uuid }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { confirmTopupLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return confirmTopupLive(viewer, data.paymentId);
  });

/** Reject a manual EFT top up. */
export const rejectTopupFn = createServerFn({ method: "POST" })
  .validator(z.object({ paymentId: uuid, reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { rejectTopupLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return rejectTopupLive(viewer, data.paymentId, data.reason);
  });

/** Void an open invoice. */
export const voidInvoiceFn = createServerFn({ method: "POST" })
  .validator(z.object({ invoiceId: uuid, reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { voidInvoiceLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return voidInvoiceLive(viewer, data.invoiceId, data.reason);
  });

/** Record a refund already paid back by hand. Amount is in cents. */
export const recordRefundFn = createServerFn({ method: "POST" })
  .validator(z.object({ paymentId: uuid, amountCents: z.number().int().min(1).max(10000000), reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { recordRefundLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return recordRefundLive(viewer, { paymentId: data.paymentId, amountCents: data.amountCents, reason: data.reason });
  });

/** Create an invoice for a restaurant (amount in cents; the screen converts from rand). */
export const createInvoiceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      restaurantId: uuid,
      amountCents: z.number().int().min(1).max(10000000),
      description: z.string().trim().min(3).max(200),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { createInvoiceLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return createInvoiceLive(viewer, data);
  });

/** Set a restaurant's monthly plan to active (money received) or cancelled. The note is required. */
export const setSubscriptionStateFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      restaurantId: uuid,
      state: z.enum(["active", "cancelled"]),
      note: reason,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { setSubscriptionStateLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setSubscriptionStateLive(viewer, data);
  });

/** Mark an open invoice paid with the money's reference. */
export const markInvoicePaidFn = createServerFn({ method: "POST" })
  .validator(z.object({ invoiceId: uuid, reference: z.string().trim().min(4).max(80), reason }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { markInvoicePaidLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-restaurants"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return markInvoicePaidLive(viewer, data.invoiceId, data.reference, data.reason);
  });
