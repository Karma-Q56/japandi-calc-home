import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for saved lists (D15).
// The restaurant comes from the server session, never from the browser.

/** The restaurant's saved lists. */
export const getListsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listSavedLists }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-lists"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return listSavedLists(viewer);
});

/** Create a saved list from chosen guests. */
export const createListFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().max(200), membershipIds: z.array(z.string().uuid()).max(2000) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { createSavedList }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-lists"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return createSavedList(viewer, data.name, data.membershipIds);
  });

/** Rename a saved list. */
export const renameListFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), name: z.string().max(200) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { renameSavedList }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-lists"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return renameSavedList(viewer, data.id, data.name);
  });

/** Delete a saved list. */
export const deleteListFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { deleteSavedList }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-lists"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return deleteSavedList(viewer, data.id);
  });
