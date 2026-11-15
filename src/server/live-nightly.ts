// Nightly upkeep (phase D16b): tell restaurants whose credit is running low, and clear receipts we
// kept for more than a day. Runs from the cron route with operator context, through
// run_nightly_maintenance (db/migrations/0033), which does both in one step.

import { sql } from "drizzle-orm";
import { withContext } from "./db";
import { LOW_CREDIT_CENTS } from "@/lib/live-campaigns";

export interface NightlyResult {
  alerted: number;
  purged: number;
}

export async function runLiveNightly(databaseUrl: string, now: number = Date.now()): Promise<NightlyResult> {
  const when = new Date(now).toISOString();
  return withContext({ databaseUrl, isOperator: true }, async (tx) => {
    const rows = await tx.execute<{ alerted: number; purged: number }>(
      sql`select alerted, purged from run_nightly_maintenance(${when}::timestamptz, ${LOW_CREDIT_CENTS}::integer)`,
    );
    return { alerted: Number(rows.rows[0]?.alerted ?? 0), purged: Number(rows.rows[0]?.purged ?? 0) };
  });
}
