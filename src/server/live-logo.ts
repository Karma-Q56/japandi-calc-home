import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { checkLogoFiles } from "@/lib/live-logo";

export type LogoInfo = { version: number };

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

/** The current logo version for the signed-in restaurant, or null when there is no logo. */
export async function loadLogo(viewer: Viewer): Promise<LogoInfo | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<{ version: number }>(sql`
        select version from restaurant_logo where restaurant_id = ${viewer.restaurantId} limit 1
      `);
      const row = result.rows[0];
      return row ? { version: Number(row.version) } : null;
    },
  );
}

/** Store the converted PNG and print JPEG, bump the version and write an audit event. */
export async function saveLogo(
  viewer: Viewer,
  png: Uint8Array,
  printJpeg: Uint8Array,
): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can change its logo." };
  const check = checkLogoFiles(png, printJpeg);
  if (!check.ok) return check;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const limit = await transaction.execute<{ n: number }>(sql`
        select count(*)::int as n from rate_limit_hit
        where bucket = 'logo-save' and key = ${viewer.userId}
          and created_at > now() - interval '1 hour'
      `);
      if (Number(limit.rows[0]?.n ?? 0) >= 20) {
        return { ok: false as const, message: "Too many logo changes in an hour. Try again later." };
      }
      await transaction.execute(sql`
        insert into rate_limit_hit (bucket, key) values ('logo-save', ${viewer.userId})
      `);
      const result = await transaction.execute<{ version: number }>(sql`
        insert into restaurant_logo (restaurant_id, png, print_jpeg, version, updated_at)
        values (${viewer.restaurantId}, ${Buffer.from(png)}, ${Buffer.from(printJpeg)}, 1, now())
        on conflict (restaurant_id) do update
          set png = excluded.png,
              print_jpeg = excluded.print_jpeg,
              version = restaurant_logo.version + 1,
              updated_at = now()
        returning version
      `);
      const row = result.rows[0];
      if (!row) return { ok: false as const, message: "Could not save the logo." };
      await transaction.execute(sql`
        insert into audit_event
          (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values
          ('owner', ${viewer.userId}, ${viewer.restaurantId}, 'logo_updated',
           'restaurant', ${viewer.restaurantId}, ${JSON.stringify({ version: Number(row.version) })}::jsonb)
      `);
      return { ok: true as const, version: Number(row.version) };
    },
  );
}

/** The PNG for a restaurant's public logo route, only for an active restaurant. */
export async function readPublicLogo(
  slug: string,
): Promise<{ png: Uint8Array; version: number } | null> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: null, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<{ png: Buffer; version: number }>(sql`
        select l.png, l.version
        from restaurant_logo l
        join restaurant r on r.id = l.restaurant_id
        where r.slug = ${slug} and r.status = 'active'
        limit 1
      `);
      const row = result.rows[0];
      return row ? { png: new Uint8Array(row.png), version: Number(row.version) } : null;
    },
  );
}
