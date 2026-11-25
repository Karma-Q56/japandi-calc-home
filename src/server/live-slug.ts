import { sql } from "drizzle-orm";
import { withContext } from "./db";

// Old page addresses (migration 0039). A restaurant whose page address was changed by an operator keeps
// its old address as a redirect, so printed QR codes still work. Public: no signed-in user is needed,
// and the answer is only the current address of an ACTIVE restaurant, which its page already shows.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The current address for an old one, or null when it is not an old address or the restaurant is not active. */
export async function resolveSlugRedirect(slug: string): Promise<string | null> {
  if (slug.length > 40 || !SLUG.test(slug)) return null;
  return withContext({ databaseUrl: databaseUrl(), restaurantId: null, isOperator: false }, async (transaction) => {
    const result = await transaction.execute<{ slug: string | null }>(sql`select resolve_slug_redirect(${slug}) as slug`);
    const next = result.rows[0]?.slug ?? null;
    return next && next !== slug ? next : null;
  });
}
