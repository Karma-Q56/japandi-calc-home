import { beforeEach, describe, expect, it } from "vitest";

import { demoRepo, updateDemo } from "@/data/repo";
import { pickSegment, saveSpinConfig, spinState, spinWheel } from "@/domain/spins";
import { createSpecial } from "@/domain/specials";
import type { SpinConfig } from "@/data/types";

beforeEach(() => {
  demoRepo.reset();
});

function spinFixture(overrides: Partial<SpinConfig> = {}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants[0]!;
  const membership = state.memberships.find(
    (item) => item.restaurantId === restaurant.id && item.stampsTotal >= 2,
  )!;
  const config: SpinConfig = {
    enabled: true,
    earnEveryVisits: 1,
    earnAtMilestone: false,
    weeklyBudgetCents: 100_000,
    segments: [
      { id: "segment-coffee", label: "Free filter coffee", weight: 1, valueCents: 100 },
    ],
    rules: "",
    ...overrides,
  };
  const saved = saveSpinConfig({ restaurantId: restaurant.id, config });
  expect(saved.ok).toBe(true);
  return { restaurant, membership, config };
}

describe("spin wheel", () => {
  it("picks a segment by weight and handles empty wheels", () => {
    const segments = [
      { id: "a", label: "A", weight: 1, valueCents: 0 },
      { id: "b", label: "B", weight: 3, valueCents: 0 },
    ];
    expect(pickSegment(segments, () => 0)?.id).toBe("a");
    expect(pickSegment(segments, () => 0.99)?.id).toBe("b");
    expect(pickSegment([], () => 0.5)).toBeNull();
    expect(pickSegment([{ id: "a", label: "A", weight: 0, valueCents: 0 }], () => 0.5)).toBeNull();
  });

  it("earns a spin from visits and turns a prize into a personal single-use offer", () => {
    const { restaurant, membership } = spinFixture();
    expect(spinState(membership.id).earned).toBeGreaterThan(0);
    const spun = spinWheel({ restaurantId: restaurant.id, membershipId: membership.id });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;
    expect(spun.data.label).toBe("Free filter coffee");
    expect(spun.data.prizeSpecialId).toBeTruthy();
    const state = demoRepo.read();
    const special = state.specials.find((item) => item.id === spun.data.prizeSpecialId)!;
    expect(special.kind).toBe("targeted");
    const code = state.specialCodes.find((item) => item.specialId === special.id)!;
    expect(code.membershipId).toBe(membership.id);
    expect(spinState(membership.id).used).toBe(1);
    expect(state.spins.filter((item) => item.membershipId === membership.id)).toHaveLength(1);
  });

  it("does not award a prize the weekly budget cannot cover", () => {
    const { restaurant, membership } = spinFixture({ weeklyBudgetCents: 50 });
    const spun = spinWheel({ restaurantId: restaurant.id, membershipId: membership.id });
    expect(spun.ok).toBe(false);
    if (!spun.ok) expect(spun.error.code).toBe("INVALID");
    expect(demoRepo.read().spins).toHaveLength(0);
  });

  it("respects a daily segment cap", () => {
    const { restaurant, membership } = spinFixture({
      segments: [
        {
          id: "segment-capped",
          label: "Capped prize",
          weight: 1,
          valueCents: 100,
          cap: { max: 1, period: "day" },
        },
      ],
    });
    expect(spinWheel({ restaurantId: restaurant.id, membershipId: membership.id }).ok).toBe(true);
    const second = spinWheel({ restaurantId: restaurant.id, membershipId: membership.id });
    expect(second.ok).toBe(false);
  });

  it("reward decider changes an existing earned reward without issuing another prize code", () => {
    const { restaurant, membership } = spinFixture({ modes: ["reward_decider"] });
    const reward = {
      id: "reward-for-decider-test",
      restaurantId: restaurant.id,
      membershipId: membership.id,
      description: "A coffee",
      earnedAt: new Date(demoRepo.read().now).toISOString(),
    };
    updateDemo((current) => ({ ...current, rewards: [...current.rewards, reward] }));
    const codesBefore = demoRepo.read().specialCodes.length;
    const spun = spinWheel({
      restaurantId: restaurant.id,
      membershipId: membership.id,
      mode: "reward_decider",
    });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;
    expect(demoRepo.read().rewards.find((item) => item.id === reward.id)?.description).toBe(spun.data.label);
    expect(spun.data.prizeSpecialId).toBeUndefined();
    expect(demoRepo.read().specialCodes).toHaveLength(codesBefore);
  });

  it("daily surprise gives one personalized code per guest and counts the Johannesburg date", () => {
    const now = Date.parse("2026-10-21T21:58:00.000Z");
    updateDemo((current) => ({ ...current, now }));
    const state = demoRepo.read();
    const restaurant = state.restaurants[0]!;
    const membership = state.memberships.find((item) => item.restaurantId === restaurant.id)!;
    const special = createSpecial({
      restaurantId: restaurant.id,
      title: "Daily surprise",
      body: "A little something today.",
      kind: "public",
      startsAt: new Date(now - 60000).toISOString(),
      endsAt: new Date(now + 86400000).toISOString(),
      code: "TODAY1",
    });
    expect(special.ok).toBe(true);
    if (!special.ok) return;
    const config: SpinConfig = {
      ...restaurant.spin,
      enabled: true,
      modes: ["daily_surprise"],
      dailyPool: [special.data.id],
    };
    const saved = saveSpinConfig({ restaurantId: restaurant.id, config });
    expect(saved.ok).toBe(true);
    const spun = spinWheel({
      restaurantId: restaurant.id,
      membershipId: membership.id,
      mode: "daily_surprise",
    });
    expect(spun.ok).toBe(true);
    if (!spun.ok) return;
    expect(spun.data.code).toBeTruthy();
    const issued = demoRepo.read().specialCodes.find((item) => item.code === spun.data.code);
    expect(issued?.membershipId).toBe(membership.id);
    expect(issued?.specialId).toBe(spun.data.prizeSpecialId);
    expect(spinWheel({ restaurantId: restaurant.id, membershipId: membership.id, mode: "daily_surprise" }).ok).toBe(false);

    updateDemo((current) => ({ ...current, now: Date.parse("2026-10-21T21:59:00.000Z") }));
    expect(spinState(membership.id).dailyAlreadyUsed).toBe(true);
    updateDemo((current) => ({ ...current, now: Date.parse("2026-10-21T22:00:00.000Z") }));
    expect(spinState(membership.id).dailyAlreadyUsed).toBe(false);
  });

  it("reward decider never selects a try-again segment", () => {
    const { restaurant, membership } = spinFixture({
      modes: ["reward_decider"],
      segments: [
        { id: "no-prize", label: "Try again", weight: 100, valueCents: 0 },
        { id: "real-prize", label: "Free tea", weight: 1, valueCents: 0 },
      ],
    });
    const reward = {
      id: "reward-for-no-prize-test",
      restaurantId: restaurant.id,
      membershipId: membership.id,
      description: "A coffee",
      earnedAt: new Date(demoRepo.read().now).toISOString(),
    };
    updateDemo((current) => ({ ...current, rewards: [...current.rewards, reward] }));
    const spun = spinWheel({ restaurantId: restaurant.id, membershipId: membership.id, mode: "reward_decider" });
    expect(spun.ok).toBe(true);
    if (spun.ok) expect(spun.data.label).toBe("Free tea");
  });

  it("refuses a spin when the guest has no visits", () => {
    const state = demoRepo.read();
    const restaurant = state.restaurants[1]!;
    const membership = state.memberships.find((item) => item.restaurantId === restaurant.id)!;
    saveSpinConfig({
      restaurantId: restaurant.id,
      config: {
        enabled: true,
        earnEveryVisits: 50,
        earnAtMilestone: false,
        weeklyBudgetCents: 100_000,
        segments: [{ id: "s", label: "Tea", weight: 1, valueCents: 100 }],
        rules: "",
      },
    });
    const spun = spinWheel({ restaurantId: restaurant.id, membershipId: membership.id });
    expect(spun.ok).toBe(false);
  });
});
