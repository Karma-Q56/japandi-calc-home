import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode, requireDatabaseUrl } from "./db/mode";
import { decideCampaign } from "./live-ops";

// Live operator console, part 2 (phase D24): campaign approvals, enquiries, feedback,
// ideas and the SMS outbox. Demo mode never imports this file.
//
// SECURITY:
// - Only a viewer whose role is 'operator' (from the server session) may call these.
// - The database functions in 0037 check the operator role again. The browser never sends a role.
// - Every write is rate limited per operator, counted in the database.
// - Reads never return guest names or phone numbers. Outbox phones are masked.

export type InboxResult = { ok: true; message?: string } | { ok: false; message: string };

/** Read results always carry the data on success. */
export type InboxReadResult<T> = { ok: true; rows: T } | { ok: false; message: string };

const DATA_MODE_ERROR = "Live operator tools need live mode.";

/** Refusal codes this file can show. Only the exact code raised by a function counts. */
const REFUSAL_CODES = [
  "not_operator",
  "campaign_not_found",
  "not_pending",
  "bad_decision",
  "bad_reason",
  "lead_not_found",
  "feedback_not_found",
  "idea_not_found",
  "invalid_value",
] as const;

/** Map a database refusal code to plain words. Read the code from the cause chain, never the message. */
export function inboxRefusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      const message = current.message.trim();
      if ((REFUSAL_CODES as readonly string[]).includes(message)) return message;
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return null;
}

export const INBOX_MESSAGES: Record<string, string> = {
  not_operator: "Only Patron staff can do this.",
  campaign_not_found: "That campaign was not found.",
  not_pending: "That campaign is no longer waiting for approval. Nothing changed.",
  bad_decision: "Choose approve or reject.",
  bad_reason: "Write a short note (up to 300 characters).",
  lead_not_found: "That enquiry was not found.",
  feedback_not_found: "That feedback was not found.",
  idea_not_found: "That idea was not found.",
  invalid_value: "That choice is not one we can save. Nothing changed.",
};

export function inboxMessageForRefusal(code: string | null): string {
  if (code && INBOX_MESSAGES[code]) return INBOX_MESSAGES[code]!;
  return "Something went wrong. Nothing changed. Try again.";
}

const WRITE_LIMIT_PER_HOUR = 60;
const TOO_MANY = "That is a lot of changes in a short time. Please wait a little and try again.";

/** At most WRITE_LIMIT_PER_HOUR writes per operator per hour, counted in the database. */
async function withinWriteLimit(operatorId: string): Promise<boolean> {
  return withContext({ databaseUrl: requireDatabaseUrl(), isOperator: false }, async (transaction) => {
    const used = await transaction.execute<{ n: number }>(sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = 'ops-write' and key = ${operatorId} and created_at > now() - interval '1 hour'
    `);
    if (Number(used.rows[0]?.n ?? 0) >= WRITE_LIMIT_PER_HOUR) return false;
    await transaction.execute(sql`insert into rate_limit_hit (bucket, key) values ('ops-write', ${operatorId})`);
    return true;
  });
}

type Failure = { ok: false; message: string };

function requireOperator(viewer: Viewer | null): Failure | null {
  if (!viewer || viewer.role !== "operator") return { ok: false, message: inboxMessageForRefusal("not_operator") };
  if (getDataMode() !== "live") return { ok: false, message: DATA_MODE_ERROR };
  return null;
}

/** Run one database function as an operator and map any refusal to plain words. */
async function runAsOperator<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T | Failure> {
  try {
    return await withContext({ databaseUrl: requireDatabaseUrl(), isOperator: true }, work);
  } catch (error) {
    return { ok: false, message: inboxMessageForRefusal(inboxRefusalCode(error)) };
  }
}

/** Gate for writes: operator check, then the rate limit. Returns a failure to stop, or null to go on. */
async function guardWrite(viewer: Viewer | null): Promise<Failure | null> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  if (!(await withinWriteLimit(viewer!.userId))) return { ok: false, message: TOO_MANY };
  return null;
}

const rowsOf = <T>(res: unknown): T[] => ((res as { rows?: T[] }).rows ?? []);

export type PendingCampaignRow = {
  id: string; restaurant_id: string; restaurant_name: string; name: string; message_body: string;
  code: string | null; est_recipients: number; est_cost_cents: number; created_at: string;
};

/** Campaigns waiting for approval, across restaurants. */
export async function listPendingCampaignsLive(
  viewer: Viewer,
): Promise<InboxReadResult<PendingCampaignRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select operator_list_pending_campaigns(${viewer.userId}) as rows`);
    return { ok: true as const, rows: (rowsOf<{ rows: PendingCampaignRow[] }>(res)[0]?.rows ?? []) as PendingCampaignRow[] };
  })) as InboxReadResult<PendingCampaignRow[]>;
}

/** Approve or reject a campaign. Calls the existing decideCampaign, after the write limit. */
export async function decideCampaignInbox(
  viewer: Viewer,
  campaignId: string,
  decision: "approve" | "reject",
  reason: string,
): Promise<InboxResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  return decideCampaign(viewer, campaignId, decision, reason);
}

export type LeadRow = {
  id: string; reference: string | null; kind: string; restaurant_name: string; contact_name: string;
  phone: string; email: string | null; role: string | null; venue_type: string | null; suburb: string | null;
  quiet_time: string | null; weekly_guests: string | null; plan_interest: string | null;
  visit_wanted: boolean | null; preferred_day: string | null; consent_at: string | null;
  calculator: Record<string, string | number | boolean | null> | null; status: string; admin_notes: string | null;
  created_at: string; replied_at: string | null; closed_at: string | null;
};

/**
 * Enquiries for the operator. An enquiry is a prospect asking to be contacted, so the contact
 * details they gave are shown. Guest data is not in this table.
 */
export async function listLeadsLive(
  viewer: Viewer,
  input: { status: string; search: string; limit: number; offset: number },
): Promise<InboxReadResult<LeadRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_list_leads(${viewer.userId}, ${input.status}, ${input.search}, ${input.limit}, ${input.offset}) as rows`,
    );
    return { ok: true as const, rows: (rowsOf<{ rows: LeadRow[] }>(res)[0]?.rows ?? []) as LeadRow[] };
  })) as InboxReadResult<LeadRow[]>;
}

/** Move an enquiry to a new status and save the private note. The note is never shown to the sender. */
export async function updateLeadLive(viewer: Viewer, leadId: string, status: string, notes: string): Promise<InboxResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_update_lead(${viewer.userId}, ${leadId}::uuid, ${status}, ${notes})`);
    return { ok: true as const, message: "Saved." };
  })) as InboxResult;
}

export type FeedbackRow = {
  id: string; reference: string; restaurant_id: string | null; restaurant_name: string | null; source: string;
  category: string; message: string; contact: string | null; contact_ok: boolean; status: string;
  note: string | null; has_screenshot: boolean; created_at: string;
};

/** Feedback for the operator. The screenshot picture is never in this list. */
export async function listFeedbackLive(
  viewer: Viewer,
  input: { status: string; limit: number; offset: number },
): Promise<InboxReadResult<FeedbackRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_list_feedback(${viewer.userId}, ${input.status}, ${input.limit}, ${input.offset}) as rows`,
    );
    return { ok: true as const, rows: (rowsOf<{ rows: FeedbackRow[] }>(res)[0]?.rows ?? []) as FeedbackRow[] };
  })) as InboxReadResult<FeedbackRow[]>;
}

/** One feedback screenshot, fetched only when the operator opens it. */
export async function feedbackScreenshotLive(viewer: Viewer, feedbackId: string): Promise<InboxReadResult<string | null>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select operator_feedback_screenshot(${viewer.userId}, ${feedbackId}) as picture`);
    return { ok: true as const, rows: (rowsOf<{ picture: string | null }>(res)[0]?.picture ?? null) };
  })) as InboxReadResult<string | null>;
}

/** Save a feedback status and private note. */
export async function setFeedbackLive(
  viewer: Viewer,
  feedbackId: string,
  status: string,
  note: string,
): Promise<InboxResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_set_feedback(${viewer.userId}, ${feedbackId}, ${status}, ${note})`);
    return { ok: true as const, message: "Feedback saved." };
  })) as InboxResult;
}

export type IdeaRow = {
  id: string; place: string; suburb: string | null; asks: number; note: string | null; status: string;
  admin_notes: string | null; created_at: string;
};

/** Ideas (places guests asked for), most asked first. */
export async function listIdeasLive(
  viewer: Viewer,
  input: { status: string; limit: number; offset: number },
): Promise<InboxReadResult<IdeaRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_list_ideas(${viewer.userId}, ${input.status}, ${input.limit}, ${input.offset}) as rows`,
    );
    return { ok: true as const, rows: (rowsOf<{ rows: IdeaRow[] }>(res)[0]?.rows ?? []) as IdeaRow[] };
  })) as InboxReadResult<IdeaRow[]>;
}

/** Save an idea status and private note. */
export async function setIdeaLive(viewer: Viewer, ideaId: string, status: string, adminNotes: string): Promise<InboxResult> {
  const denied = await guardWrite(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_set_idea(${viewer.userId}, ${ideaId}, ${status}, ${adminNotes})`);
    return { ok: true as const, message: "Idea saved." };
  })) as InboxResult;
}

export type OutboxRow = {
  id: string; restaurant_name: string; campaign_name: string; channel: string; status: string; segments: number;
  cost_cents: number; error_code: string | null; queued_at: string; sent_at: string | null;
  delivered_at: string | null; phone_masked: string;
};
export type OutboxSummary = { queued: number; sent: number; failed: number; skipped: number };

/** SMS outbox messages, newest first. Phones are masked: country code and last three digits. */
export async function listOutboxLive(
  viewer: Viewer,
  input: { status: string; limit: number; offset: number },
): Promise<InboxReadResult<OutboxRow[]>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_list_outbox(${viewer.userId}, ${input.status}, ${input.limit}, ${input.offset}) as rows`,
    );
    return { ok: true as const, rows: (rowsOf<{ rows: OutboxRow[] }>(res)[0]?.rows ?? []) as OutboxRow[] };
  })) as InboxReadResult<OutboxRow[]>;
}

/** Counts for the outbox summary line. */
export async function outboxSummaryLive(viewer: Viewer): Promise<InboxReadResult<OutboxSummary>> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  return (await runAsOperator(async (tx) => {
    const res = await tx.execute(sql`select operator_outbox_summary(${viewer.userId}) as summary`);
    const summary = rowsOf<{ summary: OutboxSummary }>(res)[0]?.summary;
    return { ok: true as const, rows: summary ?? { queued: 0, sent: 0, failed: 0, skipped: 0 } };
  })) as InboxReadResult<OutboxSummary>;
}
