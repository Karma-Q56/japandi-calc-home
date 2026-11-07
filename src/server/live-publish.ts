import { sql, type SQL } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode } from "./db/mode";
import { publishErrorMessage, type Readiness, type PublishStatus } from "@/lib/live-publish";

// Live publishing for phase D10. Demo mode never imports this file.
//
// SECURITY:
// - Each change is made by SQL functions (migration 0014) that look up the caller's own
//   restaurant and require owner or manager. The caller never sends a restaurant id.
// - Publishing is rate limited per user (10 an hour) through rate_limit_hit.

export const PUBLISH_PER_HOUR = 10;

type DbResult<T> = { rows: T[] };

async function q<T>(transaction: DatabaseTransaction, query: SQL): Promise<T[]> {
  const res = (await transaction.execute(query)) as unknown as DbResult<T>;
  return res.rows;
}

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

const REFUSAL_CODES = ["not_allowed", "not_ready", "bad_state"] as const;

/** Read the short refusal code from the error chain by exact match (see live-onboarding). */
export function refusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message: string = current.message;
    const match = REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

export type PublishState = {
  slug: string;
  status: PublishStatus;
  listed: boolean;
  readiness: Readiness;
};

function ownerOnly(viewer: Viewer | null): viewer is Viewer & { restaurantId: string } {
  return (
    !!viewer &&
    (viewer.role === "owner" || viewer.role === "manager") &&
    typeof viewer.restaurantId === "string"
  );
}

/** The owner's publish state, readiness and listing. Null for anyone else or in demo mode. */
export async function getPublishState(viewer: Viewer | null): Promise<PublishState | null> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return null;
  const restaurantId = viewer.restaurantId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const rows = await q<{
      slug: string;
      status: string;
      public_listed: boolean;
      has_menu: boolean;
      has_staff: boolean;
      has_suburb: boolean;
    }>(
      tx,
      sql`
        select r.slug, r.status::text as status, r.public_listed,
               rd.has_menu, rd.has_staff, rd.has_suburb
        from restaurant r, restaurant_readiness(r.id) rd
        where r.id = ${restaurantId} limit 1
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      slug: row.slug,
      status: row.status as PublishStatus,
      listed: row.public_listed,
      readiness: { hasMenu: row.has_menu, hasStaff: row.has_staff, hasSuburb: row.has_suburb },
    };
  });
}

async function countHits(tx: DatabaseTransaction, bucket: string, key: string): Promise<number> {
  const rows = await q<{ n: number | string }>(
    tx,
    sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = ${bucket} and key = ${key}
        and created_at > now() - interval '1 hour'
    `,
  );
  return Number(rows[0]?.n ?? 0);
}

async function runChange(
  viewer: Viewer | null,
  call: (tx: DatabaseTransaction, userId: string) => Promise<unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (getDataMode() !== "live") return { ok: false, message: publishErrorMessage("not_allowed") };
  if (!ownerOnly(viewer)) return { ok: false, message: publishErrorMessage("not_allowed") };
  const restaurantId = viewer.restaurantId;
  const userId = viewer.userId;
  try {
    return await withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
      const hits = await countHits(tx, "publish", userId);
      if (hits >= PUBLISH_PER_HOUR) return { ok: false as const, message: publishErrorMessage("rate_limited") };
      await q<unknown>(tx, sql`insert into rate_limit_hit (bucket, key) values ('publish', ${userId})`);
      await call(tx, userId);
      return { ok: true as const };
    });
  } catch (error) {
    return { ok: false, message: publishErrorMessage(refusalCode(error)) };
  }
}

/** Put the restaurant live. Refused with a plain message until the checklist is complete. */
export function publishRestaurant(viewer: Viewer | null) {
  return runChange(viewer, (tx, userId) =>
    q<unknown>(tx, sql`select publish_restaurant(${userId}) as status`),
  );
}

/** Take the restaurant offline. Guests can no longer see the page or join. */
export function unpublishRestaurant(viewer: Viewer | null) {
  return runChange(viewer, (tx, userId) =>
    q<unknown>(tx, sql`select unpublish_restaurant(${userId}) as status`),
  );
}

/** Show or hide the restaurant in Find. Turning it on is refused unless it is live. */
export function setRestaurantListed(viewer: Viewer | null, listed: boolean) {
  return runChange(viewer, (tx, userId) =>
    q<unknown>(tx, sql`select set_restaurant_listed(${userId}, ${listed}) as listed`),
  );
}
