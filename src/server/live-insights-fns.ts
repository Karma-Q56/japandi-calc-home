import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the Insights page (D14). The signed-in restaurant
// always comes from the session, never from the browser.

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Owner and manager view of guests and performance for a from/to window. */
export const getInsightsFn = createServerFn({ method: "GET" })
  .validator(z.object({ from: daySchema, to: daySchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { loadInsights }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-insights"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return loadInsights(viewer, data.from, data.to);
  });
