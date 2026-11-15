import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getCookies } from "@tanstack/react-start/server";
import { SIGNED_OUT_MESSAGE, UNLOCK_FIRST_MESSAGE } from "@/lib/till-messages";
import { orderProblem, cleanLines, type TillOrderLine } from "@/lib/live-till-orders";
import { withContext, type DatabaseTransaction } from "./db";
import { readTillSession, TILL_DEVICE_COOKIE } from "./live-till";
import { runOrderHooks } from "./live-after-visit";

// Till orders (D13c): what a guest had, recorded right after a stamp.
// SECURITY:
// - Restaurant and staff come from the signed till cookies, never the browser.
// - The staff member must still be active.
// - Rate limited per till device through rate_limit_hit (bucket till-order).
// - The SQL function checks the stamp, the menu items and the restaurant again.

export const TILL_ORDER_PER_HOUR = 60;
export const TILL_ORDER_BUCKET = "till-order";

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

type DbResult<T> = { rows: T[] };

async function q<T>(transaction: DatabaseTransaction, query: SQL): Promise<T[]> {
  const res = (await transaction.execute(query)) as unknown as DbResult<T>;
  return res.rows;
}

export type TillOrderOutcome = { ok: true; saved: true } | { ok: false; message: string };

const ORDER_REFUSALS: Record<string, string> = {
  stamp_not_found: "That visit could not be found. Stamp the guest again.",
  stamp_too_old: "The window to add items has closed. Ask the owner to fix it.",
  too_many_items: "You can add up to 12 items for one visit.",
  item_not_allowed: "One of those items is no longer on the menu. Pick again.",
};

/** Stable key for this till device, so one till cannot flood the table. */
function deviceKey(): string {
  const raw = getCookies()[TILL_DEVICE_COOKIE] ?? "";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function saveTillOrder(
  membershipId: string,
  rawLines: TillOrderLine[],
): Promise<TillOrderOutcome> {
  const session = readTillSession();
  if (!session) return { ok: false, message: UNLOCK_FIRST_MESSAGE };

  const lines = cleanLines(rawLines);
  const problem = orderProblem(lines);
  if (problem) return { ok: false, message: problem };

  const key = deviceKey();

  const outcome = await withContext(
    { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
    async (transaction) => {
      const hits = await q<{ n: number | string }>(
        transaction,
        sql`
          select count(*)::int as n from rate_limit_hit
          where bucket = ${TILL_ORDER_BUCKET} and key = ${key}
            and created_at > now() - interval '1 hour'
        `,
      );
      if (Number(hits[0]?.n ?? 0) >= TILL_ORDER_PER_HOUR) {
        return { ok: false as const, message: "Too many saves in a row. Wait a minute and try again." };
      }

      const staff = await q<{ id: string }>(
        transaction,
        sql`
          select id from staff_member
          where id = ${session.staffId} and restaurant_id = ${session.restaurantId} and active = true
          limit 1
        `,
      );
      if (!staff[0]) return { ok: false as const, message: SIGNED_OUT_MESSAGE };

      const stamp = await q<{ id: string }>(
        transaction,
        sql`
          select id from stamp_event
          where membership_id = ${membershipId} and restaurant_id = ${session.restaurantId}
            and status = 'valid' and reason = 'visit'
          order by created_at desc
          limit 1
        `,
      );
      if (!stamp[0]) return { ok: false as const, message: ORDER_REFUSALS["stamp_not_found"] ?? "" };

      await q(
        transaction,
        sql`insert into rate_limit_hit (bucket, key) values (${TILL_ORDER_BUCKET}, ${key})`,
      );

      const payload = JSON.stringify(
        lines.map((line) => ({ menu_item_id: line.menuItemId, quantity: line.quantity })),
      );
      const rows = await q<{ result: string }>(
        transaction,
        sql`select record_visit_items(${stamp[0].id}::uuid, ${payload}::jsonb) as result`,
      );
      const result = rows[0]?.result ?? "stamp_not_found";
      if (result === "saved") return { ok: true as const, stampId: stamp[0].id };
      return { ok: false as const, message: ORDER_REFUSALS[result] ?? "Could not save the order." };
    },
  );

  if (!outcome.ok) return outcome;
  await runOrderHooks({
    restaurantId: session.restaurantId,
    membershipId,
    staffId: session.staffId,
    stampId: outcome.stampId,
  });
  return { ok: true, saved: true };
}

export type TillMenu = {
  ordersAtTill: boolean;
  sections: Array<{ id: string; name: string; items: Array<{ id: string; name: string }> }>;
};

/** The till's menu: available items grouped by section, plus whether orders at the till are on. */
export async function loadTillMenu(): Promise<TillMenu | null> {
  const session = readTillSession();
  if (!session) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurants = await q<{ orders_at_till: boolean }>(
        transaction,
        sql`select orders_at_till from restaurant where id = ${session.restaurantId} limit 1`,
      );
      const sections = await q<{ id: string; name: string }>(
        transaction,
        sql`
          select id, name from menu_section
          where restaurant_id = ${session.restaurantId}
          order by sort_order, name
        `,
      );
      const items = await q<{ id: string; name: string; section_id: string | null }>(
        transaction,
        sql`
          select id, name, section_id from menu_item
          where restaurant_id = ${session.restaurantId} and available = true
          order by sort_order, name
        `,
      );
      const grouped = sections.map((section) => ({
        id: section.id,
        name: section.name,
        items: items
          .filter((item) => item.section_id === section.id)
          .map((item) => ({ id: item.id, name: item.name })),
      }));
      const loose = items
        .filter((item) => item.section_id === null)
        .map((item) => ({ id: item.id, name: item.name }));
      if (loose.length > 0) grouped.push({ id: "other", name: "Other", items: loose });
      return {
        ordersAtTill: restaurants[0]?.orders_at_till === true,
        sections: grouped.filter((section) => section.items.length > 0),
      };
    },
  );
}

/** Most ordered items for one guest (owner side). Empty when there is no data. */
export async function getGuestFavouritesFor(
  restaurantId: string,
  membershipId: string,
): Promise<Array<{ menuItemId: string; name: string; count: number }>> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const rows = await q<{ menu_item_id: string; name: string; times: number | string }>(
        transaction,
        sql`
          select vi.menu_item_id, mi.name, sum(vi.quantity)::int as times
          from visit_item vi
          join stamp_event se on se.id = vi.stamp_event_id
          join menu_item mi on mi.id = vi.menu_item_id
          where se.membership_id = ${membershipId} and se.restaurant_id = ${restaurantId}
          group by vi.menu_item_id, mi.name
          order by times desc, mi.name
          limit 5
        `,
      );
      return rows.map((row) => ({
        menuItemId: row.menu_item_id,
        name: row.name,
        count: Number(row.times),
      }));
    },
  );
}
