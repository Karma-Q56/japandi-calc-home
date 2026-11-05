import { beforeEach, describe, expect, it } from "vitest";
import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { getCustomerData, requestAccountDeletion } from "@/domain/members";
import { recordStamp } from "@/domain/stamps";
import { recordOrder, setOrderTracking } from "@/domain/orders";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
  // Seeded visits are spread around the reset time, so start the clock after the latest one.
  const latest = Math.max(...demoRepo.read().stamps.map((s) => Date.parse(s.createdAt)));
  if (latest >= clock.now()) clock.advance(latest - clock.now() + 24 * 60 * 60 * 1000);
});

/**
 * The demo venues allow one stamp per 4 hours, and the seeded guests have
 * recent stamps. Move the clock past that window before each new stamp.
 */
const PAST_WINDOW_MS = 301 * 60 * 1000;

/** A usable seeded membership at the Daily Grind, for a realistic privacy flow. */
function busiestMembership() {
  const state = demoRepo.read();
  return state.memberships.find((item) => item.restaurantId === "rest-daily-grind")!;
}

describe("privacy: download and delete include birthdays and orders", () => {
  it("the data download includes birthday, visit patterns and orders", () => {
    const membership = busiestMembership();
    const customer = demoRepo.read().customers.find((c) => c.id === membership.customerId)!;
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === customer.id ? { ...item, birthday: { day: 14, month: 6 } } : item,
      ),
    }));
    const tracked = setOrderTracking({
      restaurantId: "rest-daily-grind",
      trackOrders: true,
      session: { role: "owner", restaurantId: "rest-daily-grind" },
    });
    expect(tracked.ok).toBe(true);
    clock.advance(PAST_WINDOW_MS);
    const stamp = recordStamp({
      restaurantId: "rest-daily-grind",
      membershipId: membership.id,
      staffId: "staff-test",
      key: "till-privacy-test-1",
      session: { role: "staff", restaurantId: "rest-daily-grind" },
    });
    expect(stamp.ok).toBe(true);
    if (!stamp.ok) return;
    if (stamp.data.result !== "stamped") {
      throw new Error(`the stamp did not land: ${stamp.data.result}`);
    }
    const stampId = stamp.data.stampId;
    if (stampId === "") return;
    const order = recordOrder({
      restaurantId: "rest-daily-grind",
      membershipId: membership.id,
      stampId,
      lines: [{ label: "Flat white", qty: 1, kind: "item" }],
      billRand: 48,
      session: { role: "staff", restaurantId: "rest-daily-grind" },
    });
    expect(order.ok).toBe(true);
    const downloaded = getCustomerData(customer.id);
    expect(downloaded.ok).toBe(true);
    if (!downloaded.ok) return;
    expect(downloaded.data.birthday).toEqual({ day: 14, month: 6 });
    const orders = downloaded.data.memberships.flatMap((entry) => entry.orders);
    const mine = orders.find((item) => item.stampId === stampId);
    expect(mine).toBeTruthy();
    expect(mine!.items[0]!.label).toBe("Flat white");
    expect(mine!.billCents).toBe(4800);
  });

  it("deleting an account removes its birthday and orders", () => {
    const membership = busiestMembership();
    const customer = demoRepo.read().customers.find((c) => c.id === membership.customerId)!;
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === customer.id ? { ...item, birthday: { day: 3, month: 11 } } : item,
      ),
      orders: [
        ...current.orders,
        {
          id: "order-privacy-test-1",
          restaurantId: membership.restaurantId,
          membershipId: membership.id,
          source: "till" as const,
          items: [{ label: "Banana bread", qty: 1, kind: "item" as const }],
          createdAt: new Date(clock.now()).toISOString(),
        },
      ],
    }));
    const result = requestAccountDeletion(customer.id);
    expect(result.ok).toBe(true);
    const state = demoRepo.read();
    const after = state.customers.find((item) => item.id === customer.id)!;
    expect(after.deleted).toBe(true);
    expect(after.name).toBe("");
    expect(after.birthday).toBeUndefined();
    expect(state.orders.some((item) => item.membershipId === membership.id)).toBe(false);
  });
});
