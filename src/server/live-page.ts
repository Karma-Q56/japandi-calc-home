import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { adminErrorMessage, ADMIN_REFUSAL_CODES } from "@/lib/live-admin";
import {
  DEFAULT_THEME,
  fullWeek,
  themeForSave,
  validateDesign,
  validatePage,
  type Hours,
  type PageInput,
} from "@/lib/live-page";
import type { Theme } from "@/data/types";

// Live "Your page" and card design (D13b2). The restaurant comes from the signed-in owner or
// manager, never from the browser. The SQL functions in migration 0034 check it again.

export type OwnerPage = {
  name: string;
  slug: string;
  status: string;
  tagline: string;
  about: string;
  suburb: string;
  venueType: string;
  address: string;
  hours: Hours;
  theme: Theme;
  logoVersion: number | null;
};

export type PageResult = { ok: true } | { ok: false; message: string };

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

/** Read the refusal code the database raised, by exact match on the error chain. */
function refusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message: string = current.message;
    const match = ADMIN_REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

type PageRow = {
  name: string;
  slug: string;
  status: string;
  suburb: string | null;
  venue_type: string;
  address: string | null;
  about_text: string | null;
  hours: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  logo_version: number | null;
};

/** The words, hours and card design of the signed-in restaurant, for the owner to edit. */
export async function loadOwnerPage(viewer: Viewer | null): Promise<OwnerPage | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<PageRow>(sql`
        select r.name, r.slug, r.status, r.suburb, r.venue_type, r.address, r.about_text, r.hours, r.theme,
               (select l.version from restaurant_logo l where l.restaurant_id = r.id) as logo_version
        from restaurant r
        where r.id = ${viewer.restaurantId}
        limit 1
      `);
      const row = result.rows[0];
      if (!row) return null;
      const stored = (row.theme ?? {}) as Partial<Theme>;
      const theme: Theme = { ...DEFAULT_THEME, ...stored };
      return {
        name: row.name,
        slug: row.slug,
        status: row.status,
        tagline: theme.tagline,
        about: row.about_text ?? "",
        suburb: row.suburb ?? "",
        venueType: row.venue_type,
        address: row.address ?? "",
        hours: fullWeek(row.hours),
        theme,
        logoVersion: row.logo_version === null ? null : Number(row.logo_version),
      };
    },
  );
}

function refused(error: unknown): PageResult {
  return { ok: false, message: adminErrorMessage(refusalCode(error)) };
}

/** Save the words and opening hours. */
export async function saveOwnerPage(viewer: Viewer | null, input: PageInput): Promise<PageResult> {
  if (!canManage(viewer)) return { ok: false, message: adminErrorMessage("not_allowed") };
  const problem = validatePage(input);
  if (problem) return { ok: false, message: problem };
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          select save_owner_page(${viewer.userId}, ${input.tagline}, ${input.about},
            ${input.suburb}, ${input.address}, ${JSON.stringify(fullWeek(input.hours))}::jsonb,
            ${input.venueType})
        `);
      },
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Save the card colours, fonts, stamp shape, background and pixel logo stamp. */
export async function saveOwnerDesign(viewer: Viewer | null, theme: Theme): Promise<PageResult> {
  if (!canManage(viewer)) return { ok: false, message: adminErrorMessage("not_allowed") };
  const clean = themeForSave(theme);
  const problem = validateDesign(clean);
  if (problem) return { ok: false, message: problem };
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          select save_owner_design(${viewer.userId}, ${JSON.stringify(clean)}::jsonb)
        `);
      },
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Remove the stored logo and take it off the card. */
export async function removeOwnerLogo(viewer: Viewer | null): Promise<PageResult> {
  if (!canManage(viewer)) return { ok: false, message: adminErrorMessage("not_allowed") };
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          delete from restaurant_logo where restaurant_id = ${viewer.restaurantId}
        `);
        await transaction.execute(sql`select sync_owner_logo(${viewer.userId})`);
        await transaction.execute(sql`
          insert into audit_event
            (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
          values
            ('owner', ${viewer.userId}, ${viewer.restaurantId}, 'logo_removed',
             'restaurant', ${viewer.restaurantId}, '{}'::jsonb)
        `);
      },
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
