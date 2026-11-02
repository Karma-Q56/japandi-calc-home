import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { validateMenuItem, validateSectionName } from "@/lib/live-menu";

export type LiveMenuItem = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};

export type LiveMenuSection = {
  id: string;
  name: string;
  sortOrder: number;
  items: LiveMenuItem[];
};

export type LiveMenu = {
  restaurantName: string;
  sections: LiveMenuSection[];
};

type SectionRow = { id: string; name: string; sort_order: number };
type ItemRow = {
  id: string;
  section_id: string | null;
  name: string;
  description: string | null;
  price_cents: number | null;
  available: boolean;
  sort_order: number;
};

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

async function audit(
  transaction: DatabaseTransaction,
  viewer: Viewer,
  action: string,
  objectType: string,
  objectId: string,
  meta: Record<string, string | number | boolean> = {},
) {
  await transaction.execute(sql`
    insert into audit_event
      (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values
      ('owner', ${viewer.userId}, ${viewer.restaurantId}, ${action},
       ${objectType}, ${objectId}, ${JSON.stringify(meta)}::jsonb)
  `);
}

export async function loadMenu(viewer: Viewer): Promise<LiveMenu | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurant = await transaction.execute<{ name: string }>(sql`
        select name from restaurant where id = ${viewer.restaurantId} limit 1
      `);
      if (!restaurant.rows[0]) return null;
      const sections = await transaction.execute<SectionRow>(sql`
        select id, name, sort_order from menu_section
        where restaurant_id = ${viewer.restaurantId}
        order by sort_order, name
      `);
      const items = await transaction.execute<ItemRow>(sql`
        select id, section_id, name, description, price_cents, available, sort_order
        from menu_item
        where restaurant_id = ${viewer.restaurantId}
        order by sort_order, name
      `);
      return {
        restaurantName: restaurant.rows[0].name,
        sections: sections.rows.map((section) => ({
          id: section.id,
          name: section.name,
          sortOrder: Number(section.sort_order),
          items: items.rows
            .filter((item) => item.section_id === section.id)
            .map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description ?? "",
              priceCents: Number(item.price_cents ?? 0),
              available: item.available,
              sortOrder: Number(item.sort_order),
            })),
        })),
      };
    },
  );
}

export async function createSection(
  viewer: Viewer,
  rawName: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its menu." };
  const valid = validateSectionName(rawName);
  if (!valid.ok) return { ok: false, message: valid.message };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const created = await transaction.execute<{ id: string }>(sql`
        insert into menu_section (restaurant_id, name, sort_order)
        values (
          ${viewer.restaurantId},
          ${valid.name},
          coalesce((select max(sort_order) + 1 from menu_section where restaurant_id = ${viewer.restaurantId}), 0)
        )
        returning id
      `);
      const id = created.rows[0]?.id;
      if (!id) return { ok: false as const, message: "Could not create the section." };
      await audit(transaction, viewer, "menu_section_created", "menu_section", id, {
        name: valid.name,
      });
      return { ok: true as const, id };
    },
  );
}

export async function createItem(
  viewer: Viewer,
  input: { sectionId: string; name: string; description: string; priceCents: number },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its menu." };
  const valid = validateMenuItem(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const section = await transaction.execute<{ id: string }>(sql`
        select id from menu_section
        where id = ${input.sectionId} and restaurant_id = ${viewer.restaurantId}
        limit 1
      `);
      if (!section.rows[0]) return { ok: false as const, message: "Choose a section first." };
      const created = await transaction.execute<{ id: string }>(sql`
        insert into menu_item
          (restaurant_id, section_id, name, description, price_cents, available, sort_order)
        values (
          ${viewer.restaurantId}, ${input.sectionId}, ${valid.name}, ${valid.description},
          ${input.priceCents}, true,
          coalesce((select max(sort_order) + 1 from menu_item where section_id = ${input.sectionId}), 0)
        )
        returning id
      `);
      const id = created.rows[0]?.id;
      if (!id) return { ok: false as const, message: "Could not create the item." };
      await audit(transaction, viewer, "menu_item_created", "menu_item", id, {
        sectionId: input.sectionId,
        priceCents: input.priceCents,
      });
      return { ok: true as const, id };
    },
  );
}

export async function setItemAvailable(
  viewer: Viewer,
  itemId: string,
  available: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its menu." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const updated = await transaction.execute<{ id: string }>(sql`
        update menu_item set available = ${available}
        where id = ${itemId} and restaurant_id = ${viewer.restaurantId}
        returning id
      `);
      if (!updated.rows[0]) return { ok: false as const, message: "Item not found." };
      await audit(transaction, viewer, "menu_item_visibility", "menu_item", itemId, {
        available,
      });
      return { ok: true as const };
    },
  );
}
