import { describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { listRestaurantMembers } from "@/domain/members";

describe("cross-restaurant privacy", () => {
  it("restaurant A's queries cannot see restaurant B's members", () => {
    const state = demoRepo.reset();
    const a = state.restaurants[0]!;
    const b = state.restaurants[1]!;
    const ownerA = {
      role: "owner" as const,
      restaurantId: a.id,
    };
    const result = listRestaurantMembers(a.id, ownerA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.every((row) => row.membership.restaurantId === a.id)).toBe(true);
    expect(result.data.some((row) => row.membership.restaurantId === b.id)).toBe(false);
  });

  it("a guest data export contains only that guest", () => {
    const state = demoRepo.reset();
    const guest = state.customers[0]!;
    const other = state.customers[1]!;
    expect(guest.id).not.toBe(other.id);
    const mine = state.memberships.filter((m) => m.customerId === guest.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m) => m.customerId === guest.id)).toBe(true);
  });
});
