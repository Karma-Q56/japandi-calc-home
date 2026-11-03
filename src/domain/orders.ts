import { demoRepo, updateDemo } from "@/data/repo";
import type { MenuItem, Order, OrderLine, OrderSource, Restaurant } from "@/data/types";
import { clock } from "@/lib/clock";
import { failure, success, type ApiResult } from "./demo";
import { requireScope } from "./audit";

/** Simple meal categories for venues that do not track single items. */
export const ORDER_CATEGORIES = [
  "Breakfast",
  "Coffee",
  "Lunch",
  "Dinner",
  "Drinks",
  "Dessert",
] as const;

export interface RecordOrderInput {
  restaurantId: string;
  membershipId: string;
  stampId?: string;
  source?: OrderSource;
  lines?: Array<{ label: string; qty?: number; kind?: "item" | "category" }>;
  /** Bill amount the staff member may type, in rand. Empty means not captured. */
  billRand?: number | null;
  session: { role: string; restaurantId?: string };
}

function checkLines(lines: OrderLine[]) {
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        (line.kind === "item" || line.kind === "category") &&
        line.label.trim().length > 0 &&
        Number.isInteger(line.qty) &&
        line.qty >= 1,
    )
  );
}

/** Save what a guest had. The stamp is already saved; this never touches it. */
export function recordOrder(input: RecordOrderInput): ApiResult<Order> {
  const scope = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scope.ok) return scope;
  const state = demoRepo.read();
  const membership = state.memberships.find(
    (item) => item.id === input.membershipId && item.restaurantId === input.restaurantId,
  );
  if (!membership) return failure("NOT_FOUND", "That guest is not on this restaurant's list.");
  const lines: OrderLine[] = (input.lines ?? []).map((line) => ({
    label: line.label.trim(),
    qty: Math.max(1, Math.round(line.qty ?? 1)),
    kind: line.kind ?? "item",
  }));
  if (!checkLines(lines)) return failure("INVALID", "Pick at least one item or category.");
  const billCents =
    input.billRand === null || input.billRand === undefined
      ? undefined
      : Math.round(input.billRand * 100);
  if (billCents !== undefined && (!Number.isFinite(billCents) || billCents < 0)) {
    return failure("INVALID", "Type the bill amount in rand.");
  }
  const order: Order = {
    id: `order-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    membershipId: input.membershipId,
    ...(input.stampId ? { stampId: input.stampId } : {}),
    source: input.source ?? "till",
    items: lines,
    ...(billCents !== undefined ? { billCents } : {}),
    createdAt: new Date(clock.now()).toISOString(),
  };
  updateDemo((current) => ({ ...current, orders: [...current.orders, order] }));
  return success(order);
}

/** How often each item or category came up, newest behaviour first. */
export function itemCounts(state: ReturnType<typeof demoRepo.read>, restaurantId: string) {
  const counts = new Map<string, { label: string; qty: number; kind: "item" | "category" }>();
  for (const order of state.orders) {
    if (order.restaurantId !== restaurantId) continue;
    for (const line of order.items) {
      const id = `${line.kind}:${line.label.toLowerCase()}`;
      const entry = counts.get(id);
      counts.set(id, {
        label: line.label,
        qty: (entry?.qty ?? 0) + line.qty,
        kind: line.kind,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.qty - a.qty);
}

const ITEM_FALLBACK = 6;

/** The buttons shown at the till: most ordered, or the menu's first items as a fallback. */
export function quickItems(restaurantId: string): Array<{ label: string; kind: "item" | "category" }> {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const mode = restaurant?.ordersMode ?? "items";
  if (mode === "categories") {
    return ORDER_CATEGORIES.map((label) => ({ label, kind: "category" as const }));
  }
  const counted = itemCounts(state, restaurantId).filter((entry) => entry.kind === "item");
  const sectionIds = restaurant?.menuSectionIds ?? [];
  const menu = state.items
    .filter((item) => item.restaurantId === restaurantId && item.available)
    .filter((item) => sectionIds.includes(item.sectionId));
  if (counted.length === 0) {
    // No orders yet: take the restaurant's own menu items in order.
    return menu.slice(0, ITEM_FALLBACK).map((item) => ({ label: item.name, kind: "item" as const }));
  }
  // Top ordered items first, then menu items that have not come up yet so the
  // till still has enough buttons on a busy morning.
  const picked = counted.slice(0, ITEM_FALLBACK).map((entry) => ({ label: entry.label, kind: "item" as const }));
  const pickedLabels = new Set(picked.map((entry) => entry.label.toLowerCase()));
  for (const item of menu) {
    if (picked.length >= ITEM_FALLBACK || pickedLabels.has(item.name.toLowerCase())) continue;
    picked.push({ label: item.name, kind: "item" });
  }
  return picked;
}

/** Search over the whole menu for the till search box. */
export function searchMenu(restaurantId: string, query: string): MenuItem[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return demoRepo
    .read()
    .items.filter((item) => item.restaurantId === restaurantId && item.available)
    .filter((item) => item.name.toLowerCase().includes(term))
    .slice(0, 12);
}

export function orderSettingsOf(restaurant: Restaurant) {
  return { trackOrders: restaurant.trackOrders ?? false, ordersMode: restaurant.ordersMode ?? "items" };
}

/** The owner's switch for what the till asks after each stamp. */
export function setOrderTracking(input: {
  restaurantId: string;
  trackOrders?: boolean;
  ordersMode?: "items" | "categories";
  session: { role: string; restaurantId?: string };
}): ApiResult<Restaurant> {
  const scope = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scope.ok) return scope;
  if (input.ordersMode && input.ordersMode !== "items" && input.ordersMode !== "categories") {
    return failure("INVALID", "Choose item mode or category mode.");
  }
  let updated: Restaurant | undefined;
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((restaurant) => {
      if (restaurant.id !== input.restaurantId) return restaurant;
      updated = {
        ...restaurant,
        ...(input.trackOrders !== undefined ? { trackOrders: input.trackOrders } : {}),
        ...(input.ordersMode !== undefined ? { ordersMode: input.ordersMode } : {}),
      };
      return updated;
    }),
  }));
  return updated && demoRepo.read().restaurants.includes(updated)
    ? success(updated)
    : failure("NOT_FOUND", "Restaurant not found.");
}
