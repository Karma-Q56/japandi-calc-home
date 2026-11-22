import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { recordStamp } from "@/domain/stamps";

const staff = { role: "staff", restaurantId: "rest-daily-grind" };

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("loyalty rule changes", () => {
  it("lowering the threshold keeps earned rewards; excess converts on next stamp", () => {
    const state = demoRepo.read();
    const membership = state.memberships.find(
      (m) =>
        m.restaurantId === "rest-daily-grind" &&
        m.stampsCurrent <= 3 &&
        // No visits in the last 28 days: no weekly streak bonus can fire, whatever the hour.
        state.stamps.every(
          (s) =>
            s.membershipId !== m.id ||
            s.status !== "valid" ||
            state.now - new Date(s.createdAt).getTime() > 28 * 24 * 60 * 60 * 1000,
        ),
    )!;
    const earnedBefore = state.rewards.filter((r) => r.membershipId === membership.id).length;
    updateDemo((current) => ({
      ...current,
      restaurants: current.restaurants.map((r) =>
        // A double stamp day or a birthday week would add a bonus stamp depending on the date the
        // test runs, so both are turned off. The answer is then the same on any day or hour.
        r.id === "rest-daily-grind"
          ? { ...r, stampsRequired: 6, doubleStamp: { enabled: false, weekday: 0 }, birthdayReward: false }
          : r,
      ),
      memberships: current.memberships.map((m) =>
        m.id === membership.id ? { ...m, stampsCurrent: 7 } : m,
      ),
    }));
    clock.advance(241 * 60 * 1000);
    const result = recordStamp({
      restaurantId: "rest-daily-grind",
      membershipId: membership.id,
      staffId: "staff-1",
      key: "convert-key",
      session: staff,
    });
    expect(result.ok && result.data.result).toBe("stamped");
    const after = demoRepo.read();
    expect(after.rewards.filter((r) => r.membershipId === membership.id).length).toBe(
      earnedBefore + 1,
    );
    expect(after.memberships.find((m) => m.id === membership.id)!.stampsCurrent).toBe(2);
  });
});
