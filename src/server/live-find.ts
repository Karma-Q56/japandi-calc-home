import { sql } from "drizzle-orm";
import { withContext } from "./db";
import { isOpenNow, FIND_VENUE_TYPES, type FindVenueType } from "@/lib/live-find";

export type FindRow = {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  venue_type: string;
  logo_url: string | null;
  has_logo: boolean;
  hours: Record<string, { open: string; close: string } | null>;
  stamps_required: number;
  reward_description: string;
  has_member_offer: boolean;
};

export type FindResult = {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  venueType: FindVenueType;
  logoUrl: string | null;
  stampsRequired: number;
  rewardDescription: string;
  open: boolean;
  hasMemberOffer: boolean;
};

export const FIND_PAGE_SIZE = 24;
export const FIND_RATE_LIMIT = { bucket: "find-search", max: 60, windowMinutes: 1 } as const;

function asVenueType(value: string): FindVenueType {
  return (FIND_VENUE_TYPES as readonly string[]).includes(value) ? (value as FindVenueType) : "other";
}

/** Shape rows for the screen. Open state uses the Johannesburg clock. */
export function mapFindRows(rows: FindRow[], epochMs: number): FindResult[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    suburb: row.suburb,
    venueType: asVenueType(row.venue_type),
    // An uploaded logo (D13b) wins over the old text address.
    logoUrl: row.has_logo ? `/r/${row.slug}/logo` : row.logo_url,
    stampsRequired: row.stamps_required,
    rewardDescription: row.reward_description,
    open: isOpenNow(row.hours ?? {}, epochMs),
    hasMemberOffer: row.has_member_offer,
  }));
}

/** Counts a search, then refuses it when the caller passed the per-minute limit. */
async function hitFindRateLimit(databaseUrl: string, key: string): Promise<boolean> {
  return withContext({ databaseUrl, restaurantId: null, isOperator: false }, async (tx) => {
    const [counted] = (
      await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from rate_limit_hit
            where bucket = ${FIND_RATE_LIMIT.bucket} and key = ${key}
              and created_at > now() - interval '1 minute'`,
      )
    ).rows;
    if ((counted?.n ?? 0) >= FIND_RATE_LIMIT.max) return false;
    await tx.execute(sql`insert into rate_limit_hit (bucket, key) values (${FIND_RATE_LIMIT.bucket}, ${key})`);
    return true;
  });
}

export async function searchFind(
  databaseUrl: string,
  input: { query: string; suburb: string; type: string; page: number },
  rateKey: string,
  epochMs = Date.now(),
): Promise<{ venues: FindResult[]; hasMore: boolean } | { limited: true }> {
  if (!(await hitFindRateLimit(databaseUrl, rateKey))) return { limited: true };
  const offset = Math.max(0, input.page) * FIND_PAGE_SIZE;
  // The database function escapes % and _ itself, so the text goes in as typed.
  const query = input.query.trim();
  // Fetch one extra row to know whether another page exists.
  const rows = await withContext({ databaseUrl, restaurantId: null, isOperator: false }, async (tx) => {
    const result = await tx.execute<FindRow>(
      sql`select * from find_restaurants(${query}, ${input.suburb}, ${input.type}, ${FIND_PAGE_SIZE + 1}, ${offset})`,
    );
    return result.rows as FindRow[];
  });
  const hasMore = rows.length > FIND_PAGE_SIZE;
  return { venues: mapFindRows(rows.slice(0, FIND_PAGE_SIZE), epochMs), hasMore };
}
