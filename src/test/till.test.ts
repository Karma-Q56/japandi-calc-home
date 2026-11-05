import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import type { Campaign, Message } from "@/data/types";
import { johannesburgWeekday } from "@/domain/tools";
import {
  lookupMember,
  recordStamp,
  redeemCampaignCode,
  undoStamp,
} from "@/domain/stamps";

const RESTAURANT = "rest-daily-grind";
const staff = { role: "staff", restaurantId: RESTAURANT };

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

function memberAtRestaurant(index = 0) {
  const state = demoRepo.read();
  const membership = state.memberships.filter((m) => m.restaurantId === RESTAURANT)[index]!;
  const customer = state.customers.find((c) => c.id === membership.customerId)!;
  return { membership, customer };
}

function stampableMembership() {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((r) => r.id === RESTAURANT)!;
  const windowMs = restaurant.visitWindowMinutes * 60 * 1000;
  const latest = (membershipId: string) =>
    Math.max(
      0,
      ...state.stamps
        .filter((stamp) => stamp.membershipId === membershipId && stamp.status === "valid")
        .map((stamp) => new Date(stamp.createdAt).getTime()),
    );
  const membership = state.memberships
    .filter((m) => m.restaurantId === RESTAURANT)
    .find((m) => state.now - latest(m.id) > windowMs)!;
  return membership;
}

function sentCampaign(overrides: Partial<Campaign> = {}): Campaign {
  const state = demoRepo.read();
  const campaign: Campaign = {
    id: "campaign-group-20",
    restaurantId: RESTAURANT,
    name: "Group lunch code",
    body: "Show this code before Friday.",
    channel: "push",
    audience: { type: "all_opted_in" },
    code: "GROUP20",
    status: "sent",
    requiresApproval: false,
    sentAt: new Date(state.now).toISOString(),
    recipients: 20,
    delivered: 20,
    failed: 0,
    actualCostCents: 0,
    createdBy: "owner-1",
    createdAt: new Date(state.now).toISOString(),
    ...overrides,
  };
  updateDemo((current) => ({
    ...current,
    campaigns: [...current.campaigns.filter((c) => c.id !== campaign.id), campaign],
  }));
  return campaign;
}

describe("till lookup card", () => {
  it("shows the first name and last initial, the stamp count and the double stamp day", () => {
    const { membership, customer } = memberAtRestaurant();
    const weekday = johannesburgWeekday(demoRepo.read().now);
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((c) =>
        c.id === customer.id ? { ...c, name: "Thandi Mokoena" } : c,
      ),
      restaurants: current.restaurants.map((r) =>
        r.id === RESTAURANT ? { ...r, doubleStamp: { enabled: true, weekday } } : r,
      ),
    }));
    const result = lookupMember({
      restaurantId: RESTAURANT,
      code: customer.memberCode,
      session: staff,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.firstName).toBe("Thandi");
    expect(result.data.lastInitial).toBe("M");
    expect(result.data.membership.stampsCurrent).toBe(membership.stampsCurrent);
    expect(result.data.doubleStampToday).toBe(true);
  });

  it("lists only rewards and live personal codes the guest can use", () => {
    const { membership } = memberAtRestaurant();
    const other = memberAtRestaurant(1);
    const state = demoRepo.read();
    const now = new Date(state.now).toISOString();
    const later = new Date(state.now + 7 * 86400000).toISOString();
    const earlier = new Date(state.now - 7 * 86400000).toISOString();
    updateDemo((current) => ({
      ...current,
      rewards: [
        ...current.rewards,
        {
          id: "reward-ready",
          restaurantId: RESTAURANT,
          membershipId: membership.id,
          description: "Free coffee",
          earnedAt: now,
        },
        {
          id: "reward-spent",
          restaurantId: RESTAURANT,
          membershipId: membership.id,
          description: "Free juice",
          earnedAt: now,
          redeemedAt: now,
        },
        {
          id: "reward-birthday",
          restaurantId: RESTAURANT,
          membershipId: membership.id,
          description: "Free cupcake",
          earnedAt: now,
          key: "birthday-item:2026",
        },
      ],
      specials: [
        {
          id: "special-live",
          restaurantId: RESTAURANT,
          title: "Spin prize",
          body: "",
          startsAt: earlier,
          endsAt: later,
          active: true,
          kind: "targeted",
        },
        {
          id: "special-expired",
          restaurantId: RESTAURANT,
          title: "Old prize",
          body: "",
          startsAt: new Date(state.now - 14 * 86400000).toISOString(),
          endsAt: earlier,
          active: true,
          kind: "targeted",
        },
      ],
      specialCodes: [
        {
          id: "code-live",
          restaurantId: RESTAURANT,
          specialId: "special-live",
          membershipId: membership.id,
          code: "SPIN123",
          issuedAt: now,
        },
        {
          id: "code-expired",
          restaurantId: RESTAURANT,
          specialId: "special-expired",
          membershipId: membership.id,
          code: "OLD1234",
          issuedAt: now,
        },
        {
          id: "code-other",
          restaurantId: RESTAURANT,
          specialId: "special-live",
          membershipId: other.membership.id,
          code: "OTHER123",
          issuedAt: now,
        },
      ],
    }));
    const result = lookupMember({
      restaurantId: RESTAURANT,
      code: memberAtRestaurant().customer.memberCode,
      session: staff,
    });
    if (!result.ok) throw new Error(result.error.message);
    const rewardIds = result.data.rewards.map((reward) => reward.id);
    expect(rewardIds).toEqual(
      expect.arrayContaining(["reward-ready", "reward-birthday"]),
    );
    expect(rewardIds).not.toContain("reward-spent");
    expect(result.data.offers.map((offer) => offer.code)).toEqual(["SPIN123"]);
  });
});

describe("offer codes at the till", () => {
  it("counts a shared code against the whole group", () => {
    sentCampaign();
    const first = memberAtRestaurant(0);
    const second = memberAtRestaurant(1);
    const one = redeemCampaignCode({
      code: "GROUP20",
      membershipId: first.membership.id,
      actorId: "staff-1",
      session: staff,
    });
    if (!one.ok) throw new Error(one.error.message);
    expect(one.data.used).toBe(1);
    expect(one.data.total).toBe(20);

    const again = redeemCampaignCode({
      code: "GROUP20",
      membershipId: first.membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toMatch(/already used/);

    const two = redeemCampaignCode({
      code: "GROUP20",
      membershipId: second.membership.id,
      actorId: "staff-2",
      session: staff,
    });
    if (!two.ok) throw new Error(two.error.message);
    expect(two.data.used).toBe(2);
  });

  it("refuses a code outside its dates and a guest who was not sent it", () => {
    const { membership } = memberAtRestaurant(0);
    const other = memberAtRestaurant(1);
    sentCampaign({ validTo: new Date(demoRepo.read().now - 86400000).toISOString() });
    const expired = redeemCampaignCode({
      code: "GROUP20",
      membershipId: membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.message).toMatch(/expired/);

    sentCampaign({ validFrom: new Date(demoRepo.read().now + 86400000).toISOString() });
    const early = redeemCampaignCode({
      code: "GROUP20",
      membershipId: membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.message).toMatch(/not valid yet/);

    const campaign = sentCampaign();
    const message: Message = {
      id: "msg-other",
      restaurantId: RESTAURANT,
      customerId: other.customer.id,
      membershipId: other.membership.id,
      campaignId: campaign.id,
      channel: "push",
      body: campaign.body,
      segments: 1,
      costCents: 0,
      status: "delivered",
      attempts: 1,
      createdAt: new Date(demoRepo.read().now).toISOString(),
    };
    updateDemo((current) => ({
      ...current,
      messages: [...current.messages, message],
    }));
    const notSent = redeemCampaignCode({
      code: "GROUP20",
      membershipId: membership.id,
      actorId: "staff-1",
      session: staff,
    });
    expect(notSent.ok).toBe(false);
    if (!notSent.ok) expect(notSent.error.message).toMatch(/not a recipient/);
  });
});

describe("undo and the audit trail", () => {
  it("undoes within ten minutes and logs the staff member by name", () => {
    const membership = stampableMembership();
    const member = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT)!;
    const stamped = recordStamp({
      restaurantId: RESTAURANT,
      membershipId: membership.id,
      staffId: member.id,
      key: "undo-1",
      session: staff,
    });
    if (!stamped.ok || stamped.data.result !== "stamped") throw new Error("stamp failed");
    clock.advance(5 * 60 * 1000);
    const undone = undoStamp({
      stampId: stamped.data.stampId,
      actorId: member.id,
      session: staff,
    });
    expect(undone.ok).toBe(true);
    const audit = demoRepo.read().audit[0]!;
    expect(audit.action).toBe("undo");
    expect(audit.actor).toBe(member.displayName);
  });

  it("refuses an undo after ten minutes", () => {
    const membership = stampableMembership();
    const stamped = recordStamp({
      restaurantId: RESTAURANT,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "undo-2",
      session: staff,
    });
    if (!stamped.ok || stamped.data.result !== "stamped") throw new Error("stamp failed");
    clock.advance(11 * 60 * 1000);
    const undone = undoStamp({
      stampId: stamped.data.stampId,
      actorId: "staff-1",
      session: staff,
    });
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.error.message).toMatch(/10 minutes/);
  });

  it("retries a stamp with the same key without adding a second one", () => {
    const membership = stampableMembership();
    const before = demoRepo.read().stamps.filter((s) => s.membershipId === membership.id).length;
    const first = recordStamp({
      restaurantId: RESTAURANT,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "retry-1",
      session: staff,
    });
    const retry = recordStamp({
      restaurantId: RESTAURANT,
      membershipId: membership.id,
      staffId: "staff-1",
      key: "retry-1",
      session: staff,
    });
    expect(first.ok && first.data.result).toBe("stamped");
    expect(retry.ok && retry.data.result).toBe("duplicate_retry");
    const after = demoRepo.read().stamps.filter((s) => s.membershipId === membership.id).length;
    expect(after).toBe(before + 1);
  });
});
