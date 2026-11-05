import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  computeStamp,
  lookupMember,
  recordStamp,
  redeemCampaignCode,
  redeemReward,
  undoStamp,
} from "@/domain/stamps";

const staff = { role: "staff", restaurantId: "rest-daily-grind" };

function membershipFixture() {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((r) => r.id === staff.restaurantId)!;
  const windowMs = restaurant.visitWindowMinutes * 60 * 1000;
  const latestValid = (membershipId: string) =>
    Math.max(
      0,
      ...state.stamps
        .filter((s) => s.membershipId === membershipId && s.status === "valid")
        .map((s) => new Date(s.createdAt).getTime()),
    );
  const membership = state.memberships
    .filter((m) => m.restaurantId === restaurant.id)
    .find((m) => state.now - latestValid(m.id) > windowMs)!;
  return { restaurant, membership };
}

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("stamp rule engine", () => {
  it("stamps, and a second tap with a new key inside the window is too_soon", () => {
    const { membership } = membershipFixture();
    const first = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "key-1",
      session: staff,
    });
    expect(first.ok && first.data.result).toBe("stamped");
    const second = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "key-2",
      session: staff,
    });
    expect(second.ok && second.data.result).toBe("too_soon");
    if (second.ok && second.data.result === "too_soon") {
      expect(new Date(second.data.nextAllowedAt).getTime()).toBeGreaterThan(clock.now());
    }
  });

  it("same idempotency key twice creates exactly one stamp", () => {
    const { membership } = membershipFixture();
    const before = demoRepo.read().stamps.length;
    recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "same-key",
      session: staff,
    });
    const retry = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "same-key",
      session: staff,
    });
    expect(retry.ok && retry.data.result).toBe("duplicate_retry");
    expect(demoRepo.read().stamps.filter((stamp) => stamp.key === "same-key")).toHaveLength(1);
  });

  it("stamps again after the visit window passes", () => {
    const { membership, restaurant } = membershipFixture();
    recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "w-1",
      session: staff,
    });
    clock.advance(restaurant.visitWindowMinutes * 60 * 1000 + 1000);
    const again = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "w-2",
      session: staff,
    });
    expect(again.ok && again.data.result).toBe("stamped");
  });

  it("creates a reward and resets stamps at the threshold", () => {
    const { membership, restaurant } = membershipFixture();
    const needed = restaurant.stampsRequired - membership.stampsCurrent;
    for (let i = 0; i < needed; i++) {
      clock.advance(restaurant.visitWindowMinutes * 60 * 1000 + 1000);
      recordStamp({
        restaurantId: staff.restaurantId,
        membershipId: membership.id,
        staffId: "staff-1",
        key: `threshold-${i}`,
        session: staff,
      });
    }
    const updated = demoRepo.read().memberships.find((m) => m.id === membership.id)!;
    expect(updated.stampsCurrent).toBeLessThan(restaurant.stampsRequired);
    const reward = demoRepo
      .read()
      .rewards.find((r) => r.membershipId === membership.id && !r.redeemedAt);
    expect(reward?.description).toBe(restaurant.rewardDescription);
  });

  it("refuses members of another restaurant", () => {
    const state = demoRepo.read();
    const foreign = state.memberships.find((m) => m.restaurantId !== staff.restaurantId)!;
    const foreignCustomer = state.customers.find((c) => c.id === foreign.customerId)!;
    const result = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: foreign.id,
      staffId: "staff-1",
      key: "x",
      session: staff,
    });
    expect(result.ok && result.data.result).toBe("not_a_member");
    const lookup = lookupMember({
      restaurantId: staff.restaurantId,
      code: foreignCustomer.memberCode,
      session: staff,
    });
    expect(lookup.ok).toBe(false);
  });

  it("pure compute matches record outcomes without writing", () => {
    const state = demoRepo.read();
    const { membership } = membershipFixture();
    const decided = computeStamp(state, {
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      key: "pure-1",
    });
    expect(decided.result).toBe("stamped");
    expect(demoRepo.read().stamps.length).toBe(state.stamps.length);
  });
});

describe("undo", () => {
  it("voids the stamp, reconciles counters, and voids its reward", () => {
    // Isolate the undo arithmetic from visit extras, which add their own stamps.
    updateDemo((state) => ({
      ...state,
      challenges: [],
      restaurants: state.restaurants.map((restaurant) =>
        restaurant.id === staff.restaurantId
          ? { ...restaurant, mysteryEveryVisits: 0, birthdayReward: false }
          : restaurant,
      ),
    }));
    const { membership, restaurant } = membershipFixture();
    const needed = restaurant.stampsRequired - membership.stampsCurrent;
    let lastId = "";
    for (let i = 0; i < needed; i++) {
      clock.advance(restaurant.visitWindowMinutes * 60 * 1000 + 1000);
      const res = recordStamp({
        restaurantId: staff.restaurantId,
        membershipId: membership.id,
        staffId: "staff-1",
        key: `undo-${i}`,
        session: staff,
      });
      if (res.ok && res.data.result === "stamped") lastId = res.data.stampId;
    }
    const undo = undoStamp({ stampId: lastId, actorId: "staff-1", session: staff });
    expect(undo.ok).toBe(true);
    const updated = demoRepo.read().memberships.find((m) => m.id === membership.id)!;
    expect(updated.stampsCurrent).toBe(restaurant.stampsRequired - 1);
    expect(demoRepo.read().rewards.some((r) => r.stampId === lastId)).toBe(false);
  });

  it("refuses undo after 10 minutes", () => {
    const { membership } = membershipFixture();
    const res = recordStamp({
      restaurantId: staff.restaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "late-undo",
      session: staff,
    });
    const stampId = res.ok && res.data.result === "stamped" ? res.data.stampId : "";
    clock.advance(11 * 60 * 1000);
    const undo = undoStamp({ stampId, actorId: "staff-1", session: staff });
    expect(undo.ok).toBe(false);
  });
});

describe("redeem", () => {
  it("redeems a waiting reward with actor and time", () => {
    const state = demoRepo.read();
    const waiting = state.rewards.find(
      (r) => r.restaurantId === staff.restaurantId && !r.redeemedAt,
    )!;
    const result = redeemReward({
      rewardId: waiting.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(result.ok).toBe(true);
    const updated = demoRepo.read().rewards.find((r) => r.id === waiting.id)!;
    expect(updated.redeemedBy).toBe("staff-1");
    expect(updated.redeemedAt).toBeDefined();
  });

  it("redeems a campaign code once, then refuses repeats", () => {
    const { membership } = membershipFixture();
    const first = redeemCampaignCode({
      code: "tuesday",
      membershipId: membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(first.ok).toBe(true);
    const repeat = redeemCampaignCode({
      code: "TUESDAY",
      membershipId: membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(repeat.ok).toBe(false);
  });
});
