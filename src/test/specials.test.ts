import { beforeEach, describe, expect, it } from "vitest";

import { demoRepo } from "@/data/repo";
import {
  createSpecial,
  offersForMembership,
  publicSpecialsFor,
  redeemSpecial,
} from "@/domain/specials";

beforeEach(() => {
  demoRepo.reset();
});

function venue() {
  const state = demoRepo.read();
  const restaurant = state.restaurants[0]!;
  const memberships = state.memberships.filter((item) => item.restaurantId === restaurant.id);
  const start = new Date(state.now - 86400000).toISOString();
  const end = new Date(state.now + 7 * 86400000).toISOString();
  return { state, restaurant, first: memberships[0]!, second: memberships[1]!, start, end };
}

const staff = (restaurantId: string) => ({ role: "staff", restaurantId });
const DAY = 86400000;

describe("special kinds", () => {
  it("public: one shared code, one redemption per membership", () => {
    const { restaurant, first, second, start, end } = venue();
    const created = createSpecial({
      restaurantId: restaurant.id,
      title: "Two for one coffee",
      body: "Show this code before 11am.",
      kind: "public",
      code: "PUBLIC1",
      startsAt: start,
      endsAt: end,
    });
    expect(created.ok).toBe(true);
    expect(publicSpecialsFor(restaurant.id).some((item) => item.code === "PUBLIC1")).toBe(true);

    const m1 = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: "PUBLIC1",
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(m1.ok).toBe(true);
    const again = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: "PUBLIC1",
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("INVALID");

    const m2 = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: second.id,
      code: "PUBLIC1",
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(m2.ok).toBe(true);
  });

  it("members: visible to members at the venue, never public, shared code once each", () => {
    const { restaurant, first, second, start, end } = venue();
    const created = createSpecial({
      restaurantId: restaurant.id,
      title: "Members pasta night",
      body: "Wednesdays only.",
      kind: "members",
      code: "MEMBERS1",
      startsAt: start,
      endsAt: end,
    });
    expect(created.ok).toBe(true);
    expect(publicSpecialsFor(restaurant.id).some((item) => item.code === "MEMBERS1")).toBe(false);
    const offers = offersForMembership(first.id);
    expect(
      offers.ok && offers.data.offers.some(({ special }) => special.code === "MEMBERS1"),
    ).toBe(true);

    expect(
      redeemSpecial({
        restaurantId: restaurant.id,
        membershipId: first.id,
        code: "MEMBERS1",
        actorId: "staff-1",
        session: staff(restaurant.id),
      }).ok,
    ).toBe(true);
    expect(
      redeemSpecial({
        restaurantId: restaurant.id,
        membershipId: second.id,
        code: "MEMBERS1",
        actorId: "staff-1",
        session: staff(restaurant.id),
      }).ok,
    ).toBe(true);
    const third = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: "MEMBERS1",
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(third.ok).toBe(false);
  });

  it("targeted: unique code for its member only, once", () => {
    const { restaurant, first, second, start, end } = venue();
    const created = createSpecial({
      restaurantId: restaurant.id,
      title: "A table for two",
      body: "Just for you.",
      kind: "targeted",
      targetMembershipIds: [first.id],
      startsAt: start,
      endsAt: end,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = demoRepo
      .read()
      .specialCodes.find((item) => item.specialId === created.data.id && item.membershipId === first.id)!;
    expect(code).toBeDefined();

    const mine = offersForMembership(first.id);
    expect(
      mine.ok && mine.data.offers.some(({ special }) => special.id === created.data.id),
    ).toBe(true);
    const theirs = offersForMembership(second.id);
    expect(
      theirs.ok && theirs.data.offers.some(({ special }) => special.id === created.data.id),
    ).toBe(false);
    expect(
      demoRepo.read().specialCodes.filter((item) => item.specialId === created.data.id),
    ).toHaveLength(1);

    // Forwarded link: another member tries to use it at the till.
    const forwarded = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: second.id,
      code: code.code,
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(forwarded.ok).toBe(false);
    if (!forwarded.ok) expect(forwarded.error.message).toBe("This offer is for another member.");

    const used = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: code.code,
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(used.ok).toBe(true);
    const again = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: code.code,
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toBe("That code has already been used.");
  });

  it("refuses an ended special and a code from another venue", () => {
    const { state, restaurant, first, start, end } = venue();
    const other = state.restaurants[1]!;
    createSpecial({
      restaurantId: restaurant.id,
      title: "Paused deal",
      body: "Hidden shortly.",
      kind: "public",
      code: "PAUSED1",
      startsAt: start,
      endsAt: end,
    });
    const paused = createSpecial({
      restaurantId: restaurant.id,
      title: "Old deal",
      body: "No longer running.",
      kind: "public",
      code: "OLD1",
      startsAt: new Date(state.now - 8 * DAY).toISOString(),
      endsAt: new Date(state.now - DAY).toISOString(),
    });
    expect(paused.ok).toBe(true);
    const expired = redeemSpecial({
      restaurantId: restaurant.id,
      membershipId: first.id,
      code: "OLD1",
      actorId: "staff-1",
      session: staff(restaurant.id),
    });
    expect(expired.ok).toBe(false);

    const elsewhere = redeemSpecial({
      restaurantId: other.id,
      membershipId: first.id,
      code: "PAUSED1",
      actorId: "staff-1",
      session: staff(other.id),
    });
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.error.code).toBe("NOT_FOUND");
  });
});
