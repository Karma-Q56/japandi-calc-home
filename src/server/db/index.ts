import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type DatabaseTransaction = Parameters<Parameters<NeonDatabase["transaction"]>[0]>[0];

type DatabaseContext = {
  databaseUrl: string;
  restaurantId?: string | null;
  customerId?: string | null;
  /** Branch the request works at. Read by the fill trigger for new rows. */
  locationId?: string | null;
  isOperator?: boolean;
};

/** Run tenant-aware database work in a transaction with request-local RLS context. */
export async function withContext<T>(
  context: DatabaseContext,
  callback: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  if (!context.databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const pool = new Pool({ connectionString: context.databaseUrl, max: 1 });
  try {
    const database = drizzle(pool);
    return await database.transaction(async (transaction) => {
      await transaction.execute(sql`
        select
          set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
          set_config('app.customer_id', ${context.customerId ?? ""}, true),
          set_config('app.location_id', ${context.locationId ?? ""}, true),
          set_config('app.is_operator', ${context.isOperator ? "true" : "false"}, true)
      `);
      return callback(transaction);
    });
  } finally {
    await pool.end();
  }
}

export async function checkDatabase(databaseUrl: string): Promise<number> {
  return withContext({ databaseUrl }, async (transaction) => {
    const result = await transaction.execute<{ ok: number }>(sql`select 1 as ok`);
    return Number(result.rows[0]?.ok ?? 0);
  });
}
