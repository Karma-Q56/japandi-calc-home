import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the credit screen (D15).
// The restaurant comes from the server session, never from the browser.

/** Balance, reserved, available and the ledger for the signed-in owner. */
export const getCreditFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getLiveCredit }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-credit"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return getLiveCredit(viewer);
});

/** Record a top-up request for the operator to match against an EFT. */
export const requestTopupFn = createServerFn({ method: "POST" })
  .validator(z.object({ amountCents: z.number().int() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { requestLiveTopup }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-credit"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return requestLiveTopup(viewer, data.amountCents);
  });
