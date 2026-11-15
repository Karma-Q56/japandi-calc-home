import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for specials (D12e).
// The restaurant comes from the server session, never from the browser.

const specialInput = z.object({
  title: z.string().max(200),
  reward: z.string().max(300),
  kind: z.enum(["public", "members", "targeted"]),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40),
  percentOff: z.number().int().min(0).max(100).nullable(),
  amountOffCents: z.number().int().min(0).nullable(),
  active: z.boolean(),
});

/** The signed-in owner's specials. */
export const getSpecialsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listSpecials }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-specials"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return listSpecials(viewer);
});

/** Create or edit a special with validation. */
export const saveSpecialFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid().nullable(), input: specialInput }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveSpecial }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-specials"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return saveSpecial(viewer, data.id, data.input);
  });

/** Pause or restart a special. */
export const setSpecialActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setSpecialActive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-specials"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setSpecialActive(viewer, data.id, data.active);
  });

/** End a special now. */
export const endSpecialFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { endSpecial }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-specials"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return endSpecial(viewer, data.id);
  });

/** Issue one unique code for each chosen member of a targeted special. */
export const issueTargetedCodesFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), membershipIds: z.array(z.string().uuid()).max(500) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { issueTargetedCodes }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-specials"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return issueTargetedCodes(viewer, data.id, data.membershipIds);
  });

/** The specials the signed-in guest may use at one restaurant, from the session and slug. */
export const getGuestSpecialsFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { getRepos }, { listGuestSpecials }] = await Promise.all([
      import("./auth-viewer"),
      import("./repos"),
      import("./live-specials"),
    ]);
    const viewer = await readViewer();
    if (!viewer || viewer.role !== "guest" || !viewer.customerId) return null;
    const { repos } = getRepos({
      DATA_MODE: process.env["DATA_MODE"],
      DATABASE_URL: process.env["DATABASE_URL"],
    });
    const card = await repos.getCard(data.slug, viewer.customerId);
    if (!card) return null;
    return listGuestSpecials(card.restaurant.id, card.membership.id);
  });
