import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions for live branches (D20). The UI calls these only in live mode.
// Each one loads the signed-in viewer itself, so the browser never sends a restaurant id.

const locationSchema = z.object({
  name: z.string().max(200),
  address: z.string().max(400),
  suburb: z.string().max(200),
  city: z.string().max(200),
});

export const getBranchesFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadBranches }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-locations"),
  ]);
  return loadBranches(await readViewer());
});

export const createBranchFn = createServerFn({ method: "POST" })
  .validator(locationSchema)
  .handler(async ({ data }) => {
    const [{ readViewer }, { createBranch }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-locations"),
    ]);
    return createBranch(await readViewer(), data);
  });

export const updateBranchFn = createServerFn({ method: "POST" })
  .validator(locationSchema.extend({ locationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { updateBranch }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-locations"),
    ]);
    const { locationId, ...input } = data;
    return updateBranch(await readViewer(), locationId, input);
  });

export const setBranchStateFn = createServerFn({ method: "POST" })
  .validator(z.object({ locationId: z.string().uuid(), action: z.enum(["main", "off", "on"]) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, lib] = await Promise.all([
      import("./auth-viewer"),
      import("./live-locations"),
    ]);
    const viewer = await readViewer();
    if (data.action === "main") return lib.makeMainBranch(viewer, data.locationId);
    if (data.action === "off") return lib.turnOffBranch(viewer, data.locationId);
    return lib.turnOnBranch(viewer, data.locationId);
  });

export const setStaffBranchFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      staffId: z.string().uuid(),
      locationId: z.string().uuid().nullable(),
      allBranches: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { setStaffBranch }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-locations"),
    ]);
    return setStaffBranch(await readViewer(), data.staffId, data.locationId, data.allBranches);
  });
