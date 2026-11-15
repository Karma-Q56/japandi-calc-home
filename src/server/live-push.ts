import { sql, type SQL } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode } from "./db/mode";

// Live web push subscriptions for phase D17. Demo mode never imports this file.
//
// SECURITY:
// - The guest comes from the server session (viewer.customerId). Never from the browser.
// - A guest can add and remove only their own subscription (row policy push_guest_own, 0028).
// - Subscribing is rate limited per user (10 an hour) through rate_limit_hit.
// - The endpoint must be https and under 500 characters. The keys must be base64url of the right length.

export const PUSH_SUBSCRIBE_PER_HOUR = 10;
export const PUSH_BUCKET = "push-subscribe";
const ENDPOINT_MAX = 500;
const KEY_P256DH_LENGTH = 87; // 65 bytes, base64url without padding
const KEY_AUTH_MAX = 30; // 16 bytes, base64url without padding
const USER_AGENT_MAX = 200;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

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

export type PushSubscribeInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

/** Check a browser subscription. Returns a short reason when it is not valid. */
export function subscriptionProblem(input: PushSubscribeInput): string | null {
  const endpoint = input.endpoint.trim();
  if (!endpoint || endpoint.length > ENDPOINT_MAX) return "bad_endpoint";
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "bad_endpoint";
  }
  if (url.protocol !== "https:") return "bad_endpoint";
  const { p256dh, auth } = input.keys;
  if (p256dh.length !== KEY_P256DH_LENGTH || !BASE64URL.test(p256dh)) return "bad_keys";
  if (auth.length === 0 || auth.length > KEY_AUTH_MAX || !BASE64URL.test(auth)) return "bad_keys";
  return null;
}

export type PushResult =
  | { ok: true }
  | { ok: false; message: string };

function liveOnly(): PushResult | null {
  if (getDataMode() !== "live")
    return { ok: false, message: "Notifications are only available in live mode." };
  return null;
}

function messageFor(reason: string): string {
  switch (reason) {
    case "bad_endpoint":
      return "This browser gave an address we cannot use for notifications. Try again.";
    case "bad_keys":
      return "This browser gave incomplete notification keys. Try again.";
    case "rate_limited":
      return "You have tried too many times this hour. Try again later.";
    case "not_a_guest":
      return "Sign in to turn on notifications.";
    default:
      return "We could not turn on notifications. Please try again.";
  }
}

/** Save or refresh this guest's subscription for this browser. */
export async function subscribePush(
  viewer: Viewer,
  input: PushSubscribeInput,
): Promise<PushResult> {
  const off = liveOnly();
  if (off) return off;
  if (!viewer.customerId) return { ok: false, message: messageFor("not_a_guest") };
  const problem = subscriptionProblem(input);
  if (problem) return { ok: false, message: messageFor(problem) };

  const customerId = viewer.customerId;
  const endpoint = input.endpoint.trim();
  const userAgent = input.userAgent?.slice(0, USER_AGENT_MAX) ?? null;

  return withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    const recent = await q<{ n: number | string }>(
      transaction,
      sql`
        select count(*)::int as n from rate_limit_hit
        where bucket = ${PUSH_BUCKET} and key = ${viewer.userId}
          and created_at > now() - interval '1 hour'
      `,
    );
    if (Number(recent[0]?.n ?? 0) >= PUSH_SUBSCRIBE_PER_HOUR) {
      return { ok: false as const, message: messageFor("rate_limited") };
    }
    await q<unknown>(
      transaction,
      sql`insert into rate_limit_hit (bucket, key) values (${PUSH_BUCKET}, ${viewer.userId})`,
    );
    await q<unknown>(
      transaction,
      sql`
        insert into push_subscription (customer_id, endpoint, p256dh, auth, user_agent)
        values (${customerId}, ${endpoint}, ${input.keys.p256dh}, ${input.keys.auth}, ${userAgent})
        on conflict (endpoint) do update
          set customer_id = excluded.customer_id,
              p256dh = excluded.p256dh,
              auth = excluded.auth,
              user_agent = excluded.user_agent,
              disabled_at = null,
              failed_at = null
      `,
    );
    return { ok: true as const };
  });
}

/** Remove this guest's subscription for this browser. Other guests' rows are never touched. */
export async function unsubscribePush(viewer: Viewer, endpoint: string): Promise<PushResult> {
  const off = liveOnly();
  if (off) return off;
  if (!viewer.customerId) return { ok: false, message: messageFor("not_a_guest") };
  const clean = endpoint.trim();
  if (!clean || clean.length > ENDPOINT_MAX) return { ok: false, message: messageFor("bad_endpoint") };

  return withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    await q<unknown>(
      transaction,
      sql`delete from push_subscription where endpoint = ${clean} and customer_id = ${viewer.customerId}`,
    );
    return { ok: true as const };
  });
}

export type PushState = { subscribed: boolean };

/** Whether this guest's current browser has a live subscription. */
export async function getPushState(viewer: Viewer, endpoint: string | null): Promise<PushState> {
  if (getDataMode() !== "live" || !viewer.customerId || !endpoint) return { subscribed: false };
  return withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    const rows = await q<{ n: number | string }>(
      transaction,
      sql`
        select count(*)::int as n from push_subscription
        where endpoint = ${endpoint.trim()} and customer_id = ${viewer.customerId}
          and disabled_at is null
      `,
    );
    return { subscribed: Number(rows[0]?.n ?? 0) > 0 };
  });
}
