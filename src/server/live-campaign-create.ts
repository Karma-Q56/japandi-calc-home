import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode } from "./db/mode";
import { messageSegments } from "@/domain/campaigns";
import { CODE_PATTERN, MESSAGE_MAX, SEGMENT_SAMPLE_NAME, type AudienceType } from "@/lib/live-campaigns";

// Live campaign create (phase D15). Demo mode never imports this file.
//
// SECURITY:
// - The restaurant and the caller come from the server session. Owner or manager only.
// - The browser sends the wording, audience, code, schedule and segment count. The server
//   counts the recipients and prices the campaign, so the browser never sets a cost or balance.
// - create_campaign (SQL) reserves the cost once in the credit ledger, under a fixed reference.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

export type CampaignAudience =
  | { type: "everyone" }
  | { type: "new"; days: number }
  | { type: "lapsed30"; days: number }
  | { type: "close_to_reward"; remaining: number }
  | { type: "weekday"; weekday: number }
  | { type: "birthday_month"; month: number }
  | { type: "saved_list"; listId: string };

export type CreateCampaignInput = {
  name: string;
  body: string;
  code: string;
  audience: CampaignAudience;
  scheduledAt: string;
  segments: number;
};

export type Outcome<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; message: string };

const REFUSALS: Record<string, string> = {
  not_enough_credit: "There is not enough credit for this campaign. Add a top-up first.",
  duplicate_code: "That campaign code is already used. Pick another.",
  time_in_past: "Pick a time in the future.",
  invalid_message: "The message must be between 1 and 600 characters.",
  invalid_code: "The code must be 3 to 12 letters or numbers.",
  invalid_segments: "The message length could not be checked. Try again.",
  not_allowed: "Only the owner or a manager can create a campaign.",
};

/**
 * Read a refusal code from the cause chain by exact match. The driver wraps the database error,
 * so the database's own message is in `cause`; `error.message` holds the query text and is never read.
 */
function campaignRefusal(error: unknown): string | null {
  let current: unknown = (error as Error & { cause?: unknown })?.cause;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if ((current as Error & { code?: string }).code === "23505") return "duplicate_code";
    if (Object.prototype.hasOwnProperty.call(REFUSALS, current.message)) return current.message;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

export const CAMPAIGN_NAME_MAX = 120;

/** Recipients for an audience, counted on the server with the same rules as the send. */
export async function countCampaignRecipients(
  viewer: Viewer,
  audience: CampaignAudience,
): Promise<Outcome<{ recipients: number }>> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only the owner or a manager can see this." };
  }
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ n: number }>(sql`
        select count(*)::int as n
        from campaign_audience_ids(${viewer.restaurantId}::uuid, ${JSON.stringify(audience)}::jsonb, now())
      `);
      return { ok: true as const, recipients: Number(row.rows[0]?.n ?? 0) };
    },
  );
}

/** Create a scheduled campaign and reserve its estimated cost. */
export async function createLiveCampaign(
  viewer: Viewer,
  input: CreateCampaignInput,
): Promise<Outcome<{ campaignId: string }>> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: REFUSALS["not_allowed"]! };
  }
  const name = input.name.trim();
  const body = input.body.trim();
  const code = input.code.trim().toUpperCase();
  if (name.length === 0 || name.length > CAMPAIGN_NAME_MAX) return { ok: false, message: "Give the campaign a name." };
  if (body.length === 0 || body.length > MESSAGE_MAX) return { ok: false, message: REFUSALS["invalid_message"]! };
  if (!CODE_PATTERN.test(code)) return { ok: false, message: REFUSALS["invalid_code"]! };
  const scheduled = new Date(input.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return { ok: false, message: "Pick a valid time." };
  if (!Number.isInteger(input.segments) || input.segments < 1 || input.segments > 20) {
    return { ok: false, message: REFUSALS["invalid_segments"]! };
  }
  // The credit held is never below what the text really needs (name filled in, STOP line added),
  // whatever the browser sent.
  const segments = Math.max(input.segments, messageSegments(body, SEGMENT_SAMPLE_NAME));
  const audience = input.audience as { type: AudienceType };
  if (!audience || typeof audience.type !== "string") return { ok: false, message: "Pick a valid audience." };

  try {
    const campaignId = await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        const row = await transaction.execute<{ id: string }>(sql`
          select create_campaign(
            ${viewer.restaurantId}::uuid,
            ${viewer.userId}::text,
            ${name},
            ${body},
            ${JSON.stringify(input.audience)}::jsonb,
            ${code},
            ${scheduled.toISOString()}::timestamptz,
            ${segments}::integer
          ) as id
        `);
        return row.rows[0]?.id ?? null;
      },
    );
    return campaignId ? { ok: true, campaignId } : { ok: false, message: "The campaign was not saved." };
  } catch (error) {
    const refusal = campaignRefusal(error);
    return { ok: false, message: (refusal && REFUSALS[refusal]) || "The campaign was not saved. Try again." };
  }
}
