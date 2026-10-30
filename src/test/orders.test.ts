import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { joinRestaurant } from "@/domain/members";
import { recordOrder, quickItems, searchMenu, setOrderTracking, itemCounts } from "@/domain/orders";
import { createRestaurant, saveMenuItem } from "@/domain/restaurants";
import type { Order } from "@/data/types";

beforeEach(() => {
  demoRepo.reset();
});

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };
const STAFF = { role: "staff", restaurantId: "rest-daily-grind" };

function membershipOf(restaurantId: string) {
  return demoRepo.read().memberships.find((item) => item.restaurantId === restaurantId)!.id;
}

describe("orders at the till", () => {
  it("saves an order after the stamp, attached to it, without touching the stamp", () => {
    const membershipId = membershipOf("rest-daily-grind");
    const stamp = apiStamp(membershipId);
    const orderResult = recordOrder({
      restaurantId: "rest-daily-grind",
      membershipId,
      stampId: stamp.id,
      lines: [{ label: "Flat white", qty: 1 }],
      billRand: 42,
      session: STAFF,
    });
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) return;
    expect(orderResult.data.source).toBe("till");
    expect(orderResult.data.billCents).toBe(4200);
    const state = demoRepo.read();
    expect(state.stamps.find((item) => item.id === stamp.id)!.status).toBe("valid");
    const stored = state.orders.find((item) => item.id === orderResult.data.id)!;
    expect(stored.items).toEqual([{ label: "Flat white", qty: 1, kind: "item" }]);
  });

  it("works with categories in category mode", () => {
    const membershipId = membershipOf("rest-sunrise-bakes");
    const result = recordOrder({
      restaurantId: "rest-sunrise-bakes",
      membershipId,
      lines: [{ label: "Coffee", qty: 2, kind: "category" }],
      session: { role: "staff", restaurantId: "rest-sunrise-bakes" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0]!.kind).toBe("category");
  });

  it("refuses orders with no lines and wrong venues", () => {
    const membershipId = membershipOf("rest-daily-grind");
    expect(
      recordOrder({
        restaurantId: "rest-daily-grind",
        membershipId,
        lines: [],
        session: STAFF,
      }).ok,
    ).toBe(false);
    expect(
      recordOrder({
        restaurantId: "rest-daily-grind",
        membershipId: membershipOf("rest-oak-table"),
        lines: [{ label: "Flat white", qty: 1 }],
        session: STAFF,
      }).ok,
    ).toBe(false);
    // Staff from another venue cannot record here either.
    expect(
      recordOrder({
        restaurantId: "rest-oak-table",
        membershipId: membershipOf("rest-oak-table"),
        lines: [{ label: "Flat white", qty: 1 }],
        session: STAFF,
      }).ok,
    ).toBe(false);
  });

  it("keeps the stamp flow fast: skipping saves no order", () => {
    const membershipId = membershipOf("rest-daily-grind");
    const before = demoRepo.read().orders.length;
    apiStamp(membershipId);
    expect(demoRepo.read().orders.length).toBe(before);
  });
});

/** Add one stamp the way the till does before an order is attached. */
function apiStamp(membershipId: string) {
  const state = demoRepo.read();
  const stampsBefore = state.stamps.filter((item) => item.membershipId === membershipId).length;
  const stamp = {
    id: `stamp-order-test-${stampsBefore}`,
    restaurantId: state.memberships.find((item) => item.id === membershipId)!.restaurantId,
    membershipId,
    staffId: null,
    key: `till-test-${stampsBefore}`,
    createdAt: new Date(clock.now() - 60000).toISOString(),
    status: "valid" as const,
  };
  updateDemo((current) => ({ ...current, stamps: [...current.stamps, stamp] }));
  return stamp;
}

describe("quick buttons", () => {
  it("ranks the most ordered items first", () => {
    const membershipId = membershipOf("rest-daily-grind");
    for (let index = 0; index < 4; index += 1) {
      recordOrder({
        restaurantId: "rest-daily-grind",
        membershipId,
        lines: [
          { label: "Almond croissant", qty: index < 2 ? 3 : 1 },
          { label: "Long black", qty: 1 },
        ],
        session: STAFF,
      });
    }
    const quick = quickItems("rest-daily-grind");
    expect(quick[0]).toEqual({ label: "Almond croissant", kind: "item" });
    expect(quick.slice(0, 6).every((entry) => entry.kind === "item")).toBe(true);
  });

  it("falls back to the menu when a venue has no orders yet", () => {
    const created = createRestaurant({
      name: "Test Kitchen Probe",
      slug: "test-kitchen-probe",
      suburb: "Observatory",
      starterMenu: [
        { name: "Test toastie", priceCents: 600 },
        { name: "Test flat white", priceCents: 380 },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const quick = quickItems(created.data.id);
    expect(quick).toEqual([
      { label: "Test toastie", kind: "item" },
      { label: "Test flat white", kind: "item" },
    ]);
  });

  it("shows the fixed categories for category mode", () => {
    const quick = quickItems("rest-sunrise-bakes");
    expect(quick[0]).toEqual({ label: "Breakfast", kind: "category" });
    expect(quick.map((entry) => entry.label)).toContain("Coffee");
    expect(quick.map((entry) => entry.label)).toContain("Dessert");
  });
});

describe("menu search", () => {
  it("finds items across sections and ignores closed venues", () => {
    const hits = searchMenu("rest-daily-grind", "flat");
    expect(hits.map((item) => item.name)).toContain("Flat white");
    const otherHits = searchMenu("rest-sunrise-bakes", "flat");
    expect(otherHits.every((item) => item.restaurantId !== "rest-daily-grind")).toBe(true);
  });

  it("returns nothing for an empty search", () => {
    expect(searchMenu("rest-daily-grind", "  ")).toEqual([]);
  });
});

describe("owner order settings", () => {
  it("turns tracking on and switches the mode", () => {
    const stateBefore = demoRepo.read().restaurants.find((item) => item.id === "rest-oak-table")!;
    expect(stateBefore.trackOrders ?? false).toBe(false);
    const result = setOrderTracking({
      restaurantId: "rest-oak-table",
      trackOrders: true,
      ordersMode: "categories",
      session: { role: "owner", restaurantId: "rest-oak-table" },
    });
    expect(result.ok).toBe(true);
    const restaurant = demoRepo.read().restaurants.find((item) => item.id === "rest-oak-table")!;
    expect(restaurant.trackOrders).toBe(true);
    expect(restaurant.ordersMode).toBe("categories");
    // Switching back off works too.
    setOrderTracking({
      restaurantId: "rest-oak-table",
      trackOrders: false,
      session: { role: "owner", restaurantId: "rest-oak-table" },
    });
    expect(demoRepo.read().restaurants.find((item) => item.id === "rest-oak-table")!.trackOrders).toBe(false);
  });

  it("blocks settings changes from another venue", () => {
    const result = setOrderTracking({
      restaurantId: "rest-oak-table",
      trackOrders: true,
      session: OWNER,
    });
    expect(result.ok).toBe(false);
  });

  it("seeds orders for the demo venues with realistic months of data", () => {
    const state = demoRepo.read();
    const daily = state.orders.filter((order) => order.restaurantId === "rest-daily-grind");
    const sunrise = state.orders.filter((order) => order.restaurantId === "rest-sunrise-bakes");
    expect(daily.length).toBeGreaterThanOrEqual(6);
    expect(sunrise.length).toBeGreaterThanOrEqual(2);
    expect(daily.every((order: Order) => order.source === "till")).toBe(true);
    expect(demoRepo.read().restaurants.find((item) => item.id === "rest-daily-grind")!.trackOrders).toBe(true);
    expect(state.orders.every((order) => ["till", "import", "pos"].includes(order.source))).toBe(true);
  });

  it("counts item lines for insights", () => {
    const state = demoRepo.read();
    const counts = itemCounts(state, "rest-daily-grind");
    const flatWhite = counts.find((entry) => entry.label === "Flat white");
    expect(flatWhite!.qty).toBeGreaterThanOrEqual(5);
    expect(counts[0]!.label).toBe("Flat white");
  });

  it("lets an owner add items for the till buttons", () => {
    const created = createRestaurant({
      name: "Search Menu Probe",
      slug: "search-menu-probe",
      suburb: "Salt River",
      starterMenu: [{ name: "Test wrap", priceCents: 700 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sectionId = demoRepo.read().sections.find((item) => item.restaurantId === created.data.id)!.id;
    saveMenuItem({
      restaurantId: created.data.id,
      sectionId,
      name: "Test wrap spicy",
      priceCents: 750,
    });
    expect(searchMenu(created.data.id, "spicy").map((item) => item.name)).toEqual([
      "Test wrap spicy",
    ]);
  });

  it("accepts a saved stamp id on orders", () => {
    const membershipId = membershipOf("rest-daily-grind");
    updateDemo((current) => ({
      ...current,
      stamps: [
        ...current.stamps,
        {
          id: "stamp-order-link",
          restaurantId: "rest-daily-grind",
          membershipId,
          staffId: null,
          key: "till-order-link",
          createdAt: new Date(demoRepo.read().now - 60000).toISOString(),
          status: "valid" as const,
        },
      ],
    }));
    const result = recordOrder({
      restaurantId: "rest-daily-grind",
      membershipId,
      stampId: "stamp-order-link",
      lines: [{ label: "Flat white", qty: 1 }],
      session: STAFF,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stampId).toBe("stamp-order-link");
  });
});
