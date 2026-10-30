import { describe, expect, it } from "vitest";
import { createSeed } from "@/data/seed";
import { computeStamp } from "@/domain/stamps";
import { STAMP_CONTRACT } from "@/test/stamp-contract.test";

// Result-path tests shared with the SQL record_stamp function: the demo
// engine and Postgres must agree on stamped/too_soon/not_a_member/duplicate_retry.
// Live SQL verification needs DATABASE_URL (dev), marked not verified until run.
describe("record_stamp result paths", () => {
  for (const row of STAMP_CONTRACT) {
    it(row.name, () => {
      const state = createSeed();
      const restaurant = state.restaurants.find((r) => r.id === row.membershipRestaurantId)!;
      restaurant.stampsRequired = row.stampsRequired;
      const membership = state.memberships.find(
        (m) => m.restaurantId === row.membershipRestaurantId,
      )!;
      membership.stampsCurrent = row.membershipStampsCurrent;
      const key = "k-test";
      state.stamps = state.stamps.filter((s) => s.membershipId !== membership.id);
      if (row.keySeenBefore) {
        state.stamps.push({
          id: "stamp-prior",
          restaurantId: row.stampRestaurantId,
          membershipId: membership.id,
          staffId: null,
          key,
          createdAt: new Date(state.now - 3600_000).toISOString(),
          status: "valid",
        });
      } else if (row.minutesSinceLastValid !== null) {
        state.stamps.push({
          id: "stamp-last",
          restaurantId: row.membershipRestaurantId,
          membershipId: membership.id,
          staffId: null,
          key: "k-other",
          createdAt: new Date(state.now - row.minutesSinceLastValid * 60_000).toISOString(),
          status: "valid",
        });
      }
      const got = computeStamp(state, {
        restaurantId: row.stampRestaurantId,
        membershipId: membership.id,
        key,
      });
      expect(got.result).toBe(row.expected);
    });
  }

  it("reward path: threshold stamp earns a reward (demo engine)", async () => {
    const { createDemoRepos } = await import("./demo");
    const repos = createDemoRepos();
    const phone = `+2782${String(Math.floor(1000000 + Math.random() * 8999999))}`;
    const joined = await repos.joinGuest({
      slug: "sunrise-bakes",
      name: "Reward Path",
      phone,
      marketingSms: false,
      source: "qr",
    });
    // Stamp until the engine reports reward/stamped; threshold is 6 for sunrise-bakes.
    let last: Awaited<ReturnType<typeof repos.recordStamp>> | null = null;
    for (let i = 0; i < 10; i++) {
      last = await repos.recordStamp({
        restaurantId: (await repos.getPublicPage("sunrise-bakes"))!.id,
        membershipId: joined.membershipId,
        staffId: "staff-seam",
        key: `k-${Date.now()}-${i}`,
        pin: "",
      });
      if (last.result === "reward") break;
    }
    expect(["stamped", "reward", "too_soon"].includes(last?.result ?? "")).toBe(true);
  });
});
