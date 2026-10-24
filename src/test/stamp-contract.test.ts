import { describe, expect, it } from "vitest";
import { createSeed } from "@/data/seed";
import { computeStamp } from "@/domain/stamps";

/**
 * Contract scenarios shared with db/record_stamp (M9 reuses this table
 * against the SQL function). Each row: setup description, engine inputs,
 * and the expected result name.
 */
export interface ContractScenario {
  name: string;
  membershipRestaurantId: string;
  stampRestaurantId: string;
  membershipStampsCurrent: number;
  stampsRequired: number;
  minutesSinceLastValid: number | null;
  keySeenBefore: boolean;
  expected: "stamped" | "too_soon" | "not_a_member" | "duplicate_retry";
}

export const STAMP_CONTRACT: ContractScenario[] = [
  {
    name: "first stamp for a member",
    membershipRestaurantId: "rest-daily-grind",
    stampRestaurantId: "rest-daily-grind",
    membershipStampsCurrent: 2,
    stampsRequired: 8,
    minutesSinceLastValid: 300,
    keySeenBefore: false,
    expected: "stamped",
  },
  {
    name: "second tap inside the visit window",
    membershipRestaurantId: "rest-daily-grind",
    stampRestaurantId: "rest-daily-grind",
    membershipStampsCurrent: 3,
    stampsRequired: 8,
    minutesSinceLastValid: 60,
    keySeenBefore: false,
    expected: "too_soon",
  },
  {
    name: "member of another restaurant",
    membershipRestaurantId: "rest-sunrise-bakes",
    stampRestaurantId: "rest-daily-grind",
    membershipStampsCurrent: 1,
    stampsRequired: 8,
    minutesSinceLastValid: null,
    keySeenBefore: false,
    expected: "not_a_member",
  },
  {
    name: "retried idempotency key",
    membershipRestaurantId: "rest-daily-grind",
    stampRestaurantId: "rest-daily-grind",
    membershipStampsCurrent: 4,
    stampsRequired: 8,
    minutesSinceLastValid: 300,
    keySeenBefore: true,
    expected: "duplicate_retry",
  },
  {
    name: "stamp exactly at the window edge",
    membershipRestaurantId: "rest-daily-grind",
    stampRestaurantId: "rest-daily-grind",
    membershipStampsCurrent: 0,
    stampsRequired: 8,
    minutesSinceLastValid: 240,
    keySeenBefore: false,
    expected: "stamped",
  },
];

function stateFor(scenario: ContractScenario) {
  const state = createSeed();
  const restaurant = state.restaurants.find((r) => r.id === scenario.stampRestaurantId)!;
  restaurant.stampsRequired = scenario.stampsRequired;
  restaurant.visitWindowMinutes = 240;
  const membership = state.memberships.find(
    (m) => m.restaurantId === scenario.membershipRestaurantId,
  )!;
  membership.stampsCurrent = scenario.membershipStampsCurrent;
  const key = "contract-key";
  const stamps = state.stamps.filter((s) => s.membershipId !== membership.id);
  if (scenario.minutesSinceLastValid !== null) {
    stamps.push({
      id: "contract-prior",
      restaurantId: scenario.stampRestaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key: scenario.keySeenBefore ? key : "other-key",
      createdAt: new Date(state.now - scenario.minutesSinceLastValid * 60 * 1000).toISOString(),
      status: "valid",
    });
  } else if (scenario.keySeenBefore) {
    stamps.push({
      id: "contract-prior",
      restaurantId: scenario.stampRestaurantId,
      membershipId: membership.id,
      staffId: "staff-1",
      key,
      createdAt: new Date(state.now - 300 * 60 * 1000).toISOString(),
      status: "valid",
    });
  }
  return { state: { ...state, stamps }, membershipId: membership.id, key };
}

describe("record_stamp contract (TS engine)", () => {
  for (const scenario of STAMP_CONTRACT) {
    it(scenario.name, () => {
      const { state, membershipId, key } = stateFor(scenario);
      const decided = computeStamp(state, {
        restaurantId: scenario.stampRestaurantId,
        membershipId,
        key,
      });
      expect(decided.result).toBe(scenario.expected);
    });
  }
});
