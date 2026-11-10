import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for till orders (D13c).
// The restaurant comes from the till cookies or the owner session, never from the browser.

const lineInput = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});

/** Save what the guest had for one stamped visit. */
export const saveTillOrderFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      membershipId: z.string().uuid(),
      lines: z.array(lineInput).max(50),
    }),
  )
  .handler(async ({ data }) => {
    const { saveTillOrder } = await import("./live-till-orders");
    return saveTillOrder(data.membershipId, data.lines);
  });

/** The till's menu grouped by section, and whether orders at the till are on. */
export const getTillMenuFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadTillMenu } = await import("./live-till-orders");
  return loadTillMenu();
});

/** The most ordered items for one guest. Only the signed-in owner of the restaurant may read it. */
export const getGuestFavouritesFn = createServerFn({ method: "GET" })
  .validator(z.object({ membershipId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getGuestFavouritesFor }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-till-orders"),
    ]);
    const viewer = await readViewer();
    if (!viewer || !viewer.restaurantId) return [];
    if (viewer.role !== "owner" && viewer.role !== "manager") return [];
    return getGuestFavouritesFor(viewer.restaurantId, data.membershipId);
  });
