import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions for live owner admin (phase D13a). The UI calls these only in live mode.
// Each one loads the signed-in viewer itself, so the browser never sends a restaurant id.

const settingsSchema = z.object({
  name: z.string().max(200),
  phone: z.string().max(200),
  address: z.string().max(400),
  suburb: z.string().max(200),
  venueType: z.string().max(40),
  city: z.string().max(200),
  enquiryEmail: z.string().max(300),
  offersAlerts: z.boolean(),
  ordersAtTill: z.boolean(),
  marketingWeeklyCap: z.number(),
  memberWeeklyCap: z.number(),
});

export const getOwnerSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { getOwnerSettings }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-admin"),
  ]);
  return getOwnerSettings(await readViewer());
});

export const saveOwnerSettingsFn = createServerFn({ method: "POST" })
  .validator(settingsSchema)
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveOwnerSettings }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return saveOwnerSettings(await readViewer(), data);
  });

export const setOwnerHelpFn = createServerFn({ method: "POST" })
  .validator(z.object({ enabled: z.boolean(), days: z.number() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setOwnerHelp }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return setOwnerHelp(await readViewer(), data.enabled, data.days);
  });

export const requestOwnerCampaignFn = createServerFn({ method: "POST" })
  .validator(z.object({ note: z.string().max(1000) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { requestOwnerCampaign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return requestOwnerCampaign(await readViewer(), data.note);
  });

export const listOwnerFeedbackFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listOwnerFeedback }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-admin"),
  ]);
  return listOwnerFeedback(await readViewer());
});

export const sendOwnerFeedbackFn = createServerFn({ method: "POST" })
  .validator(z.object({ category: z.string().max(40), message: z.string().max(4000) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { sendOwnerFeedback }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return sendOwnerFeedback(await readViewer(), data.category, data.message);
  });

export const listOwnerIdeasFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listOwnerIdeas }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-admin"),
  ]);
  return listOwnerIdeas(await readViewer());
});

export const submitOwnerIdeaFn = createServerFn({ method: "POST" })
  .validator(z.object({ place: z.string().max(400), note: z.string().max(1000) }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { submitOwnerIdea }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return submitOwnerIdea(await readViewer(), data.place, data.note);
  });

export const listOwnerActivityFn = createServerFn({ method: "GET" })
  .validator(z.object({ before: z.string().nullable() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { listOwnerActivity }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-admin"),
    ]);
    return listOwnerActivity(await readViewer(), data.before);
  });
