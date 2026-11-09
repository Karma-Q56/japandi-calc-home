import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode } from "./db/mode";

// Live saved lists (phase D15). Demo mode never imports this file.
//
// SECURITY:
// - The restaurant comes from the server session. Owner or manager only.
// - Every read and write is limited to the caller's restaurant (and row security applies).
// - A list holds membership ids from this restaurant only; the server checks each one.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

export const LIST_NAME_MAX = 80;
export const LIST_MEMBERS_MAX = 2000;

export type LiveList = {
  id: string;
  name: string;
  guestCount: number;
  updatedAt: string;
};

export type Outcome = { ok: true } | { ok: false; message: string };
export type OutcomeWith<T> = ({ ok: true } & T) | { ok: false; message: string };

const cleanName = (name: string): string | null => {
  const trimmed = name.trim();
  return trimmed.length === 0 || trimmed.length > LIST_NAME_MAX ? null : trimmed;
};

/** The restaurant's saved lists with how many guests each holds. */
export async function listSavedLists(viewer: Viewer): Promise<LiveList[] | null> {
  if (getDataMode() !== "live" || !canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const rows = await transaction.execute<{
        id: string;
        name: string;
        guest_count: number;
        updated_at: Date | string;
      }>(sql`
        select id, name, jsonb_array_length(membership_ids)::int as guest_count, updated_at
        from saved_list
        where restaurant_id = ${viewer.restaurantId}
        order by updated_at desc
        limit 200
      `);
      return rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        guestCount: Number(row.guest_count),
        updatedAt: new Date(row.updated_at).toISOString(),
      }));
    },
  );
}

/** Create a list from guests at this restaurant. Ids that are not its guests are dropped. */
export async function createSavedList(
  viewer: Viewer,
  name: string,
  membershipIds: string[],
): Promise<OutcomeWith<{ id: string }>> {
  if (getDataMode() !== "live" || !canManage(viewer)) return { ok: false, message: "Not allowed." };
  const cleaned = cleanName(name);
  if (!cleaned) return { ok: false, message: "Give the list a name of up to 80 characters." };
  if (membershipIds.length > LIST_MEMBERS_MAX) return { ok: false, message: "That list is too long." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ id: string }>(sql`
        insert into saved_list (restaurant_id, name, membership_ids)
        select ${viewer.restaurantId}::uuid, ${cleaned}, coalesce(jsonb_agg(m.id::text), '[]'::jsonb)
        from membership m
        where m.restaurant_id = ${viewer.restaurantId}::uuid
          and m.id::text = any(${membershipIds}::text[])
        returning id
      `);
      const id = row.rows[0]?.id;
      return id ? { ok: true as const, id } : { ok: false as const, message: "The list was not saved." };
    },
  );
}

/** Rename a list. */
export async function renameSavedList(viewer: Viewer, id: string, name: string): Promise<Outcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) return { ok: false, message: "Not allowed." };
  const cleaned = cleanName(name);
  if (!cleaned) return { ok: false, message: "Give the list a name of up to 80 characters." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ id: string }>(sql`
        update saved_list set name = ${cleaned}, updated_at = now()
        where id = ${id}::uuid and restaurant_id = ${viewer.restaurantId}::uuid
        returning id
      `);
      return row.rows[0] ? { ok: true as const } : { ok: false as const, message: "That list was not found." };
    },
  );
}

/** Delete a list. Removes only the list, never the guests or their consent. */
export async function deleteSavedList(viewer: Viewer, id: string): Promise<Outcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) return { ok: false, message: "Not allowed." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ id: string }>(sql`
        delete from saved_list
        where id = ${id}::uuid and restaurant_id = ${viewer.restaurantId}::uuid
        returning id
      `);
      return row.rows[0] ? { ok: true as const } : { ok: false as const, message: "That list was not found." };
    },
  );
}
