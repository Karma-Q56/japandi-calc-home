// Live sending (phase D16). Runs from the cron route with operator context.
// Every database call goes through SECURITY DEFINER functions in db/migrations/0027.

import { sql } from "drizzle-orm";
import { withContext } from "./db";
import { createBulkSmsFromEnv, type SmsProvider } from "./sms";
import { DISPATCH_BATCH, MAX_ATTEMPTS } from "@/domain/campaigns";
import { canRetry, sendAtOrDefer, withStopFooter } from "@/lib/live-dispatch";

type DispatchEnv = Record<string, string | undefined>;

export interface DispatchResult {
  claimed: number;
  queued: number;
  sent: number;
  failed: number;
  deferred: number;
}

/** The SMS provider for live sends. Throws when BulkSMS is not configured. */
export function liveSmsProvider(env: DispatchEnv): SmsProvider {
  return createBulkSmsFromEnv(env);
}

/**
 * One dispatch pass: claim due campaigns, queue their messages, then send a batch.
 * Quiet hours defer sending, not queueing. Failed sends are retried up to MAX_ATTEMPTS.
 */
export async function runLiveDispatch(
  databaseUrl: string,
  env: DispatchEnv,
  now: number = Date.now(),
): Promise<DispatchResult> {
  const provider = liveSmsProvider(env);
  const result: DispatchResult = { claimed: 0, queued: 0, sent: 0, failed: 0, deferred: 0 };

  const claimed = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<{ campaign_id: string }>(
      sql`select campaign_id from claim_due_campaigns(${new Date(now)}, ${DISPATCH_BATCH})`,
    );
    return rows.rows.map((row) => row.campaign_id);
  });
  result.claimed = claimed.length;

  for (const campaignId of claimed) {
    const queued = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
      const rows = await tx.execute<{ n: number }>(
        sql`select queue_campaign_messages(${campaignId}, ${new Date(now)}) as n`,
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

  const batch = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      body: string;
      phone_e164: string;
      sender: string | null;
      attempts: number;
      reference: string;
    }>(sql`
      select m.id, c.message_body as body, cu.phone_e164, r.sms_sender_name as sender,
             m.attempts, m.id::text as reference
      from message m
      join campaign c on c.id = m.campaign_id
      join membership mem on mem.id = m.membership_id
      join customer cu on cu.id = mem.customer_id
      join restaurant r on r.id = m.restaurant_id
      where m.status = 'queued' and m.channel = 'sms' and m.attempts < ${MAX_ATTEMPTS}
      order by m.queued_at
      limit ${DISPATCH_BATCH}
    `);
    return rows.rows;
  });

  for (const row of batch) {
    try {
      const sent = await provider.send({
        to: row.phone_e164,
        body: withStopFooter(row.body),
        reference: row.reference,
        ...(row.sender ? { from: row.sender } : {}),
      });
      await withContext({ databaseUrl, isOperator: true }, async (tx) => {
        await tx.execute(sql`
          update message set provider = 'bulksms', provider_message_id = ${sent.providerMessageId},
            attempts = attempts + 1, last_attempt_at = ${new Date(now)}
          where id = ${row.id}
        `);
        await tx.execute(sql`
          select record_delivery('bulksms', ${sent.providerMessageId}, 'sent', null,
            ${sent.costCents ?? null}, ${sent.segments ?? null})
        `);
      });
      result.sent += 1;
    } catch {
      // Log only the id: the error may include the number or text.
      const attempts = row.attempts + 1;
      await withContext({ databaseUrl, isOperator: true }, async (tx) => {
        await tx.execute(sql`
          update message set attempts = ${attempts}, last_attempt_at = ${new Date(now)},
            status = ${canRetry(attempts, MAX_ATTEMPTS) ? "queued" : "failed"}::message_status,
            error_code = 'send_error'
          where id = ${row.id}
        `);
      });
      result.failed += 1;
    }
  }

  return result;
}
