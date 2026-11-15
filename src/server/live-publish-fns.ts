import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions for live publishing (phase D10). The UI calls these only in live mode.
// Each one loads the signed-in viewer itself, so the browser never sends a restaurant id.

export const getPublishStateFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getPublishState }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-publish"),
  ]);
  return getPublishState(await readViewer());
});

export const publishRestaurantFn = createServerFn({ method: "POST" }).handler(async () => {
  const [{ readViewer }, { publishRestaurant }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-publish"),
  ]);
  return publishRestaurant(await readViewer());
});

export const unpublishRestaurantFn = createServerFn({ method: "POST" }).handler(async () => {
  const [{ readViewer }, { unpublishRestaurant }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-publish"),
  ]);
  return unpublishRestaurant(await readViewer());
});

export const setRestaurantListedFn = createServerFn({ method: "POST" })
  .validator(z.object({ listed: z.boolean() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setRestaurantListed }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-publish"),
    ]);
    return setRestaurantListed(await readViewer(), data.listed);
  });
