// Live sending (phase D16). Runs from the cron route with operator context.
// Every database call goes through SECURITY DEFINER functions in db/migrations/0027.

import { sql } from "drizzle-orm";
import { withContext } from "./db";
import { createBulkSmsFromEnv, type SmsProvider } from "./sms";
import { DISPATCH_BATCH, MAX_ATTEMPTS } from "@/domain/campaigns";
import { canRetry, guestMessage, sendAtOrDefer } from "@/lib/live-dispatch";

type DispatchEnv = Record<string, string | undefined>;

export interface DispatchResult {
  claimed: number;
  queued: number;
  sent: number;
  failed: number;
  deferred: number;
}

/** How long a text may stay in "sending" before we give up on it (minutes). */
export const STALE_SENDING_MINUTES = 15;

/** The SMS provider for live sends. Throws when BulkSMS is not configured. */
export function liveSmsProvider(env: DispatchEnv): SmsProvider {
  return createBulkSmsFromEnv(env);
}

type ClaimedMessage = {
  message_id: string;
  body: string;
  first_name: string | null;
  phone: string;
  sender: string | null;
  attempt: number;
};

/**
 * One dispatch pass: claim due campaigns, queue their messages for the chosen guests, then claim
 * and send one batch. Claiming moves a text to "sending" first, so two overlapping runs never send
 * the same text. Quiet hours defer sending, not queueing. A failed send is retried up to MAX_ATTEMPTS.
 * `provider` is only passed by tests; live runs build the BulkSMS provider from the environment,
 * and only when there is something to send.
 */
export async function runLiveDispatch(
  databaseUrl: string,
  env: DispatchEnv,
  now: number = Date.now(),
  provider?: SmsProvider,
): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, queued: 0, sent: 0, failed: 0, deferred: 0 };
  const when = new Date(now).toISOString();

  const claimed = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<{ campaign_id: string }>(
      sql`select campaign_id from claim_due_campaigns(${when}::timestamptz, ${DISPATCH_BATCH})`,
    );
    return rows.rows.map((row) => row.campaign_id);
  });
  result.claimed = claimed.length;

  for (const campaignId of claimed) {
    const queued = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
      const rows = await tx.execute<{ n: number }>(
        sql`select queue_campaign_messages(${campaignId}::uuid, ${when}::timestamptz) as n`,
      );
      return Number(rows.rows[0]?.n ?? 0);
    });
    result.queued += queued;
  }

  if (sendAtOrDefer(now) !== now) {
    // Quiet hours: leave queued messages for the next run after 08:00 SAST.
    result.deferred = claimed.length;
    return result;
  }

  // Texts left in "sending" by a run that died are marked failed, never sent again.
  await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    await tx.execute(sql`select fail_stale_sending(${when}::timestamptz, ${STALE_SENDING_MINUTES}::integer)`);
  });

  const batch = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<ClaimedMessage>(
      sql`select * from claim_queued_messages(${when}::timestamptz, ${DISPATCH_BATCH}::integer, ${MAX_ATTEMPTS}::integer)`,
    );
    return rows.rows;
  });
  if (batch.length === 0) return result;

  const sms = provider ?? liveSmsProvider(env);
  for (const row of batch) {
    let sent: Awaited<ReturnType<SmsProvider["send"]>> | null = null;
    try {
      sent = await sms.send({
        to: row.phone,
        body: guestMessage(row.body, row.first_name),
        reference: row.message_id,
        ...(row.sender ? { from: row.sender } : {}),
      });
    } catch {
      // Log only the id: the error may include the number or text.
      const retry = canRetry(Number(row.attempt), MAX_ATTEMPTS);
      await withContext({ databaseUrl, isOperator: true }, async (tx) => {
        await tx.execute(sql`select fail_message_send(${row.message_id}::uuid, ${retry}, 'send_error')`);
      });
      result.failed += 1;
      continue;
    }
    try {
      const accepted = sent;
      await withContext({ databaseUrl, isOperator: true }, async (tx) => {
        await tx.execute(sql`
          select finish_message_send(${row.message_id}::uuid, ${accepted.providerMessageId},
            ${accepted.costCents ?? null}::integer, ${accepted.segments ?? null}::integer)
        `);
      });
      result.sent += 1;
    } catch {
      // The provider has the text but we could not record it. The row stays "sending" and is
      // marked failed (not resent) by the next run. Carry on with the rest of the batch.
      result.failed += 1;
    }
  }

  return result;
}
