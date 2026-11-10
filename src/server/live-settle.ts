// Settles finished live campaigns (phase D16). Runs from the cron route with operator context.
// Charging and releasing happen inside settle_campaign() in db/migrations/0027, once per campaign.

import { sql } from "drizzle-orm";
import { withContext } from "./db";

export interface SettleResult {
  settled: number;
  outcomes: Record<string, number>;
}

/** Settle up to `limit` campaigns whose messages are all final. */
export async function runLiveSettle(databaseUrl: string, limit = 25): Promise<SettleResult> {
  const ready = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<{ campaign_id: string }>(
      sql`select campaign_id from campaigns_ready_to_settle(${limit})`,
    );
    return rows.rows.map((row) => row.campaign_id);
  });

  const outcomes: Record<string, number> = {};
  for (const campaignId of ready) {
    const outcome = await withContext({ databaseUrl, isOperator: true }, async (tx) => {
      const rows = await tx.execute<{ outcome: string }>(sql`select settle_campaign(${campaignId}) as outcome`);
      return rows.rows[0]?.outcome ?? "missing";
    });
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { settled: ready.length, outcomes };
}
