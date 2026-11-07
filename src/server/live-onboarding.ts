import { sql, type SQL } from "drizzle-orm";
import { RESERVED_SLUGS } from "@/config/app";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode } from "./db/mode";

// Live restaurant creation for phase D9. Demo mode never imports this file.
//
// SECURITY:
// - The caller only sends the restaurant's own details. create_restaurant_for_owner
//   (migration 0013) sets status draft, plan starter, public_listed false and the
//   owner role itself, so the caller cannot choose them.
// - Only a signed-in guest with no restaurant can create one, and only once.
// - Attempts are rate limited per user through rate_limit_hit.

export const SLUG_CHECK_PER_HOUR = 30;
export const RESTAURANT_CREATE_PER_HOUR = 3;

const NAME_MIN = 2;
const NAME_MAX = 80;
const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

/** Lowercase, trim, and check the page address rules. Returns null when it is valid. */
export function slugProblem(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    return "Use 3 to 40 letters or numbers. Single hyphens are fine.";
  }
  if (RESERVED_SLUGS.has(slug)) return "That page address is reserved. Try another.";
  return null;
}

export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return "Restaurant name must be 2 to 80 characters.";
  }
  return null;
}

const REFUSAL_CODES = [
  "slug_taken",
  "slug_reserved",
  "bad_slug",
  "bad_name",
  "bad_location",
  "already_has_restaurant",
  "not_a_guest",
  "user_not_found",
] as const;

/**
 * The database raises each refusal with the bare code as its message. The driver wraps that
 * error, and the wrapper's own message holds the query text and the typed values, so the code
 * is read from the error chain by exact match and never searched for inside other text.
 */
export function refusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message = current.message;
    const match = REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

/** Turn a database refusal code into a plain sentence for the owner. */
export function plainCreateError(error: unknown): string {
  switch (refusalCode(error)) {
    case "slug_taken":
      return "That page address is taken. Try another.";
    case "slug_reserved":
      return "That page address is reserved. Try another.";
    case "bad_slug":
      return "Use 3 to 40 letters or numbers. Single hyphens are fine.";
    case "bad_name":
      return "Restaurant name must be 2 to 80 characters.";
    case "bad_location":
      return "Check the suburb and city and try again.";
    case "already_has_restaurant":
      return "This account already has a restaurant.";
    case "not_a_guest":
      return "Only a new account can set up a restaurant.";
    case "user_not_found":
      return "Sign in again.";
    default:
      return "We could not create your restaurant. Please try again.";
  }
}

function liveOnly(): { ok: false; message: string } | null {
  if (getDataMode() !== "live")
    return { ok: false, message: "Restaurant set up is only available in live mode." };
  return null;
}

async function countHits(
  transaction: DatabaseTransaction,
  bucket: string,
  key: string,
): Promise<number> {
  const rows = await q<{ n: number | string }>(
    transaction,
    sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = ${bucket} and key = ${key}
        and created_at > now() - interval '1 hour'
    `,
  );
  return Number(rows[0]?.n ?? 0);
}

async function recordHit(transaction: DatabaseTransaction, bucket: string, key: string) {
  await q<unknown>(
    transaction,
    sql`insert into rate_limit_hit (bucket, key) values (${bucket}, ${key})`,
  );
}

/** Is this page address free? Signed-in guests only, rate limited per user. */
export async function checkSlug(
  viewer: Viewer | null,
  rawSlug: string,
): Promise<{ ok: true; available: boolean; message: string } | { ok: false; message: string }> {
  const modeRefusal = liveOnly();
  if (modeRefusal) return modeRefusal;
  if (!viewer) return { ok: false, message: "Sign in again." };
  if (viewer.role !== "guest" || viewer.restaurantId !== null) {
    return { ok: false, message: "Only a new account can set up a restaurant." };
  }

  const problem = slugProblem(rawSlug);
  if (problem) return { ok: true, available: false, message: problem };
  const slug = rawSlug.trim().toLowerCase();

  return withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    const hits = await countHits(transaction, "slug-check", viewer.userId);
    if (hits >= SLUG_CHECK_PER_HOUR) {
      return { ok: false as const, message: "Too many checks. Wait a little and try again." };
    }
    await recordHit(transaction, "slug-check", viewer.userId);
    const taken = await q<{ id: string }>(
      transaction,
      sql`select id from restaurant where slug = ${slug} limit 1`,
    );
    return taken.length > 0
      ? { ok: true as const, available: false, message: "That page address is taken. Try another." }
      : { ok: true as const, available: true, message: "That page address is free." };
  });
}

/** The owner's own page address and whether it is published yet. Null unless the viewer is an owner or manager with a restaurant. */
export async function loadMyRestaurant(
  viewer: Viewer | null,
): Promise<{ slug: string; published: boolean } | null> {
  if (getDataMode() !== "live" || !viewer) return null;
  if ((viewer.role !== "owner" && viewer.role !== "manager") || !viewer.restaurantId) return null;
  const restaurantId = viewer.restaurantId;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const rows = await q<{ slug: string; status: string }>(
        transaction,
        sql`select slug, status::text as status from restaurant where id = ${restaurantId} limit 1`,
      );
      const row = rows[0];
      return row ? { slug: row.slug, published: row.status === "active" } : null;
    },
  );
}

export type CreateRestaurantInput = {
  name: string;
  slug: string;
  suburb: string;
  city: string;
};

/** Create the signed-in guest's restaurant. Returns only the slug on success. */
export async function createRestaurantForGuest(
  viewer: Viewer | null,
  input: CreateRestaurantInput,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const modeRefusal = liveOnly();
  if (modeRefusal) return modeRefusal;
  if (!viewer) return { ok: false, message: "Sign in again." };
  if (viewer.role !== "guest" || viewer.restaurantId !== null) {
    return { ok: false, message: "Only a new account can set up a restaurant." };
  }

  const nameError = nameProblem(input.name);
  if (nameError) return { ok: false, message: nameError };
  const slugError = slugProblem(input.slug);
  if (slugError) return { ok: false, message: slugError };
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const suburb = input.suburb.trim();
  const city = input.city.trim() || "Johannesburg";

  return withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    const attempts = await countHits(transaction, "restaurant-create", viewer.userId);
    if (attempts >= RESTAURANT_CREATE_PER_HOUR) {
      return { ok: false as const, message: "Too many attempts. Wait an hour and try again." };
    }
    await recordHit(transaction, "restaurant-create", viewer.userId);
    // A nested transaction is a savepoint, so a refusal rolls back only the create and
    // the rate limit row above still commits.
    try {
      await transaction.transaction(async (inner) => {
        await q<unknown>(
          inner,
          sql`select create_restaurant_for_owner(${viewer.userId}, ${name}, ${slug}, ${suburb}, ${city})`,
        );
      });
    } catch (error) {
      return { ok: false as const, message: plainCreateError(error) };
    }
    return { ok: true as const, slug };
  });
}
