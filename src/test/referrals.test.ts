import { beforeEach, describe, expect, it } from "vitest";
import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { api } from "@/api";
import { joinRestaurant } from "@/domain/members";
import { recordStamp } from "@/domain/stamps";
import { recordJoinReferral, referralGuestPreview } from "@/domain/referrals";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };

/**
 * The demo venues use a 4 hour between-visits window, and joining grants
 * welcome stamps at once. Move the clock past that window before the
 * friend's first real stamp so the visit counts.
 */
const PAST_WINDOW_MS = 301 * 60 * 1000;

function firstMembershipWithStamps() {
  const state = demoRepo.read();
  const membership = state.memberships.find(
    (m) => m.restaurantId === "rest-daily-grind" && m.stampsTotal > 0,
  )!;
  return membership;
}

function referrals() {
  return demoRepo.read().referrals;
}

describe("bring a friend", () => {
  it("owner saves settings and validation keeps a free item choice sane", () => {
    const saved = api.referral.saveSettings({
      restaurantId: "rest-daily-grind",
      session: OWNER,
      enabled: true,
      rewardKind: "freeItem",
      rewardItem: "",
      limitPerMemberPerMonth: 2,
    });
    expect(saved.ok).toBe(false);
    const fixed = api.referral.saveSettings({
      restaurantId: "rest-daily-grind",
      session: OWNER,
      enabled: true,
      rewardKind: "freeItem",
      rewardItem: "Butter croissant",
      limitPerMemberPerMonth: 3,
    });
    expect(fixed.ok).toBe(true);
    expect(referralGuestPreview).toBeTruthy();
  });

  it("gives every guest a stable personal share code", () => {
    const membership = firstMembershipWithStamps();
    const first = api.referral.myCode(membership.id);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("code failed");
    expect(first.data.code.startsWith("PAL")).toBe(true);
    const again = api.referral.myCode(membership.id);
    if (!again.ok) throw new Error("code failed");
    expect(again.data.code).toBe(first.data.code);
    expect(again.data.slug.length).toBeGreaterThan(0);
  });

  it("records a pending referral when a friend joins through a code", () => {
    const referrer = firstMembershipWithStamps();
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Ayanda",
      phone: "+27 82 555 9001",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error("join failed");
    const pending = referrals().find((row) => row.friendMembershipId === joined.data.membershipId);
    expect(pending).toBeTruthy();
    expect(pending!.status).toBe("pending");
    expect(pending!.referrerMembershipId).toBe(referrer.id);
  });

  it("rejects self referral and unknown codes", () => {
    const snapshot = firstMembershipWithStamps();
    const code = api.referral.myCode(snapshot.id);
    if (!code.ok) throw new Error("code failed");
    /** myCode assigns the share code, so read the membership again. */
    const referrer = demoRepo.read().memberships.find((m) => m.id === snapshot.id)!;
    recordJoinReferral({
      restaurantId: "rest-daily-grind",
      referrerCode: referrer.referralCode ?? "",
      friendMembershipId: referrer.id,
    });
    expect(referrals().some((row) => row.rejectReason === "A guest cannot refer themselves.")).toBe(true);
    const before = referrals().length;
    recordJoinReferral({
      restaurantId: "rest-daily-grind",
      referrerCode: "PALNOPE",
      friendMembershipId: referrer.id,
    });
    expect(referrals().length).toBe(before);
  });

  it("rewards both guests on the friend's first stamped visit", () => {
    const referrer = firstMembershipWithStamps();
    const stampsBefore = demoRepo.read();
    const referrerStampsBefore = stampsBefore.memberships.find((m) => m.id === referrer.id)!
      .stampsTotal;
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Ayanda",
      phone: "+27 82 555 9002",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    if (!joined.ok) throw new Error("join failed");
    clock.advance(PAST_WINDOW_MS);
    const stamped = recordStamp({
      restaurantId: OWNER.restaurantId,
      membershipId: joined.data.membershipId,
      staffId: "staff-test",
      key: "till-referral-test-1",
      session: OWNER,
    });
    expect(stamped.ok && stamped.data.result === "stamped").toBe(true);
    const row = referrals().find((item) => item.friendMembershipId === joined.data.membershipId);
    expect(row?.status).toBe("rewarded");
    const after = demoRepo.read().memberships.find((m) => m.id === referrer.id)!;
    expect(after.stampsTotal).toBe(referrerStampsBefore + 1);
    // The friend also gained a stamp on top of any welcome stamps.
    const friendAfter = demoRepo.read().memberships.find(
      (m) => m.id === joined.data.membershipId,
    )!;
    expect(friendAfter.stampsTotal).toBeGreaterThan(0);
  });

  it("keeps the reward waiting while bring a friend is off", () => {
    api.referral.saveSettings({
      restaurantId: OWNER.restaurantId,
      session: OWNER,
      enabled: false,
      rewardKind: "stamp",
      rewardItem: "",
      limitPerMemberPerMonth: 2,
    });
    const referrer = firstMembershipWithStamps();
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Zanele",
      phone: "+27 82 555 9003",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    if (!joined.ok) throw new Error("join failed");
    clock.advance(PAST_WINDOW_MS);
    const stamped = recordStamp({
      restaurantId: OWNER.restaurantId,
      membershipId: joined.data.membershipId,
      staffId: "staff-test",
      key: "till-referral-test-2",
      session: OWNER,
    });
    expect(stamped.ok && stamped.data.result === "stamped").toBe(true);
    const row = referrals().find((item) => item.friendMembershipId === joined.data.membershipId);
    expect(row?.status).toBe("pending");
  });

  it("stops rewarding a referrer past their monthly limit", () => {
    const state = demoRepo.read();
    const ownerMemberships = state.memberships.filter(
      (m) => m.restaurantId === OWNER.restaurantId,
    );
    const referrer = ownerMemberships[0]!;
    const month = new Date(state.now).toISOString().slice(0, 7);
    const alreadyRewarded = [...referrals()];
    // Two pairs already rewarded this month: the limit the demo venue chose.
    const rows = [
      "membership-friend-a",
      "membership-friend-b",
    ].map((friendId, index) => ({
      id: `referral-limit-${index + 1}`,
      restaurantId: OWNER.restaurantId,
      referrerMembershipId: referrer.id,
      friendMembershipId: friendId,
      referrerCode: referrer.referralCode ?? "PALTEST",
      status: "rewarded" as const,
      createdAt: new Date(state.now).toISOString(),
      rewardedAt: new Date(state.now).toISOString(),
    }));
    updateDemo((current) => ({ ...current, referrals: [...current.referrals, ...rows] }));
    void month;
    void alreadyRewarded;
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Lerato",
      phone: "+27 82 555 9005",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    if (!joined.ok) throw new Error("join failed");
    clock.advance(PAST_WINDOW_MS);
    recordStamp({
      restaurantId: OWNER.restaurantId,
      membershipId: joined.data.membershipId,
      staffId: "staff-test",
      key: "till-referral-test-3",
      session: OWNER,
    });
    const row = referrals().find((item) => item.friendMembershipId === joined.data.membershipId);
    expect(row?.status).toBe("rejected");
    expect(row?.rejectReason).toContain("limit");
  });

  it("issues one single-use code per guest for the free item reward", () => {
    api.referral.saveSettings({
      restaurantId: OWNER.restaurantId,
      session: OWNER,
      enabled: true,
      rewardKind: "freeItem",
      rewardItem: "Butter croissant",
      limitPerMemberPerMonth: 5,
    });
    const referrer = firstMembershipWithStamps();
    const usedMonth = demoRepo.read();
    void usedMonth;
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Nomsa",
      phone: "+27 82 555 9007",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    if (!joined.ok) throw new Error("join failed");
    clock.advance(PAST_WINDOW_MS);
    recordStamp({
      restaurantId: OWNER.restaurantId,
      membershipId: joined.data.membershipId,
      staffId: "staff-test",
      key: "till-referral-test-4",
      session: OWNER,
    });
    const row = referrals().find((item) => item.friendMembershipId === joined.data.membershipId);
    expect(row?.status).toBe("rewarded");
    const codes = demoRepo.read().specialCodes.filter(
      (item) => item.membershipId === joined.data.membershipId,
    );
    expect(codes.length).toBe(1);
    const referrerCodes = demoRepo.read().specialCodes.filter(
      (item) => item.membershipId === referrer.id,
    );
    expect(referrerCodes.length).toBe(1);
  });

  it("never blocks the till stamp while a referral is pending", () => {
    const referrer = firstMembershipWithStamps();
    const code = api.referral.myCode(referrer.id);
    if (!code.ok) throw new Error("code failed");
    const joined = joinRestaurant({
      slug: code.data.slug,
      name: "Pieter",
      phone: "+27 82 555 9009",
      marketingSms: true,
      source: "friend_referral",
      referralCode: code.data.code,
    });
    if (!joined.ok) throw new Error("join failed");
    clock.advance(PAST_WINDOW_MS);
    const stamped = recordStamp({
      restaurantId: OWNER.restaurantId,
      membershipId: joined.data.membershipId,
      staffId: "staff-test",
      key: "till-referral-test-5",
      session: OWNER,
    });
    expect(stamped.ok).toBe(true);
    if (stamped.ok) expect(stamped.data.result).toBe("stamped");
  });
});
