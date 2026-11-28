import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the operator console, part 2 (D24). The operator comes from the server session.

const uuid = z.string().uuid();
/** Feedback and idea ids are text with a prefix, such as fb- or idea-, not bare UUIDs. */
const textId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);
const note = z.string().trim().max(500).default("");
const paging = {
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
};

/** Campaigns waiting for approval. */
export const listPendingCampaignsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { listPendingCampaignsLive }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-ops-inbox"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return { ok: false as const, message: "Sign in again." };
  return listPendingCampaignsLive(viewer);
});

/** Approve or reject one campaign. */
export const decideCampaignFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      campaignId: uuid,
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(300).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { decideCampaignInbox }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return decideCampaignInbox(viewer, data.campaignId, data.decision, data.reason);
  });

/** Enquiries, with a status filter and search. */
export const listLeadsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      status: z.enum(["", "new", "replied", "closed", "contacted", "demo_booked", "won", "lost"]).default(""),
      search: z.string().trim().max(80).default(""),
      ...paging,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { listLeadsLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listLeadsLive(viewer, data);
  });

/** Move an enquiry to a new status and save the private note. */
export const updateLeadFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      leadId: uuid,
      status: z.enum(["new", "replied", "closed", "contacted", "demo_booked", "won", "lost"]),
      notes: z.string().trim().max(1000).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { updateLeadLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return updateLeadLive(viewer, data.leadId, data.status, data.notes);
  });

/** Feedback, with a status filter. The screenshot is never in this list. */
export const listFeedbackFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      status: z.enum(["", "new", "seen", "planned", "done", "not_now"]).default(""),
      ...paging,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { listFeedbackLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listFeedbackLive(viewer, data);
  });

/** One feedback screenshot, fetched when the operator opens it. */
export const feedbackScreenshotFn = createServerFn({ method: "GET" })
  .validator(z.object({ feedbackId: textId }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { feedbackScreenshotLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return feedbackScreenshotLive(viewer, data.feedbackId);
  });

/** Save a feedback status and private note. */
export const setFeedbackFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      feedbackId: textId,
      status: z.enum(["new", "seen", "planned", "done", "not_now"]),
      note,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { setFeedbackLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setFeedbackLive(viewer, data.feedbackId, data.status, data.note);
  });

/** Ideas, with a status filter. */
export const listIdeasFn = createServerFn({ method: "GET" })
  .validator(z.object({ status: z.enum(["", "new", "exploring", "added"]).default(""), ...paging }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { listIdeasLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listIdeasLive(viewer, data);
  });

/** Save an idea status and private note. */
export const setIdeaFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ideaId: textId,
      status: z.enum(["new", "exploring", "added"]),
      adminNotes: note,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { setIdeaLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setIdeaLive(viewer, data.ideaId, data.status, data.adminNotes);
  });

/** SMS outbox messages, with a status filter. Phones are masked. */
export const listOutboxFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      status: z.enum(["", "queued", "sending", "sent", "delivered", "failed", "skipped"]).default(""),
      ...paging,
    }),
  )
  .handler(async ({ data }) => {
    const [{ readViewer }, { listOutboxLive }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-ops-inbox"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return listOutboxLive(viewer, data);
  });

/** Outbox counts for the summary line. */
export const outboxSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { outboxSummaryLive }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-ops-inbox"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return { ok: false as const, message: "Sign in again." };
  return outboxSummaryLive(viewer);
});
