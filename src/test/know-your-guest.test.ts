import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { joinRestaurant } from "@/domain/members";
import { recordOrder } from "@/domain/orders";
import { guestSentence, knowYourGuest, withArticle } from "@/domain/customers";

beforeEach(() => {
  demoRepo.reset();
});

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };

describe("guest sentence", () => {
  const base = {
    firstName: "Thandi",
    usualDays: [4],
    usualTime: "morning" as const,
    visits: 4,
    topItem: "Flat white" as string | null,
    stamps: 3,
    birthday: "1 October" as string | null,
    slipping: false,
  };

  it("names the guest once, then says they", () => {
    expect(guestSentence(base)).toBe(
      "Thandi usually comes in on Thursday mornings and usually has a flat white. They have 3 stamps on their card, and their birthday is 1 October.",
    );
    expect(guestSentence(base).match(/Thandi/g)).toHaveLength(1);
  });

  it("joins two days with 'and'", () => {
    expect(guestSentence({ ...base, usualDays: [4, 5] })).toContain(
      "usually comes in on Thursdays and Fridays, usually in the mornings",
    );
  });

  it("joins three days with commas and 'and'", () => {
    expect(guestSentence({ ...base, usualDays: [4, 5, 6] })).toContain(
      "usually comes in on Thursdays, Fridays and Saturdays, usually in the mornings",
    );
  });

  it("leaves out the item when nothing was captured", () => {
    const sentence = guestSentence({ ...base, topItem: null });
    expect(sentence).toContain("on Thursday mornings.");
    expect(sentence).not.toContain("usually has");
  });

  it("leaves out the birthday when the guest did not share one", () => {
    const sentence = guestSentence({ ...base, birthday: null });
    expect(sentence).toContain("They have 3 stamps on their card.");
    expect(sentence).not.toContain("birthday");
  });

  it("uses one stamp and many stamps correctly", () => {
    expect(guestSentence({ ...base, stamps: 1 })).toContain("They have 1 stamp on their card");
    expect(guestSentence({ ...base, stamps: 2 })).toContain("They have 2 stamps on their card");
  });

  it("stays plain for a guest with no recorded visit", () => {
    expect(
      guestSentence({
        ...base,
        visits: 0,
        usualDays: [],
        usualTime: null,
        topItem: null,
        stamps: 0,
        birthday: null,
      }),
    ).toBe("Thandi has a card, but has not come in yet. They have 0 stamps on their card.");
  });

  it("adds an article to a single item and leaves plurals alone", () => {
    expect(withArticle("Flat white")).toBe("a flat white");
    expect(withArticle("Ameretto biscuit")).toBe("an ameretto biscuit");
    expect(withArticle("Chips")).toBe("chips");
  });
});

describe("know your guest card", () => {
  it("builds one plain sentence with the usual day, time and top item", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Thandi Mokoena",
      phone: "+27 82 124 1001",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    updateDemo((current) => ({
      ...current,
      stamps: current.stamps.concat(
        [
          "2026-09-01T08:00:00.000Z",
          "2026-09-08T08:00:00.000Z",
          "2026-09-15T08:00:00.000Z",
        ].map((createdAt, index) => ({
          id: `know-stamp-${index}`,
          restaurantId: "rest-daily-grind",
          membershipId: joined.data.membershipId,
          staffId: null,
          key: `know-${index}`,
          createdAt,
          status: "valid" as const,
        })),
      ),
    }));
    for (let index = 0; index < 2; index += 1) {
      recordOrder({
        restaurantId: "rest-daily-grind",
        membershipId: joined.data.membershipId,
        lines: [{ label: "Flat white", qty: 1 }],
        session: OWNER,
      });
    }
    updateDemo((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === joined.data.customerId ? { ...item, birthday: { day: 12, month: 3 } } : item,
      ),
    }));
    const know = knowYourGuest({
      membershipId: joined.data.membershipId,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    expect(know.data.sentence).toContain("Thandi usually comes in on Tuesday mornings");
    expect(know.data.sentence).toContain("usually has a flat white");
    expect(know.data.sentence).toContain("birthday is 12 March");
    expect(know.data.sentence.match(/Thandi/g)).toHaveLength(1);
    expect(know.data.topItems[0]).toEqual({ label: "Flat white", qty: 2 });
    expect(know.data.lastMessage).toBeNull();
  });

  it("falls back safely when there is no data yet", () => {
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Anna V",
      phone: "+27 82 124 1002",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const know = knowYourGuest({
      membershipId: joined.data.membershipId,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    expect(know.data.sentence).toContain("Anna has visited 1 time");
    expect(know.data.sentence).not.toContain("usually comes in");
    expect(know.data.sentence).not.toContain("birthday");
    expect(know.data.topItems).toEqual([]);
    expect(know.data.patternSummary).toContain("no usual day");
    expect(know.data.birthday).toBeNull();
  });

  it("shows the last message and whether it went through", () => {
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.id === "membership-1-13")!;
    const customer = state.customers.find((item) => item.id === membership.customerId)!;
    const know = knowYourGuest({
      membershipId: membership.id,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    expect(know.data.lastMessage).toBeNull();
    updateDemo((current) => ({
      ...current,
      messages: current.messages.concat({
        id: "know-message-1",
        restaurantId: "rest-daily-grind",
        customerId: customer.id,
        membershipId: membership.id,
        campaignId: "campaign-1",
        channel: "sms" as const,
        body: "Hello there!",
        segments: 1,
        costCents: 35,
        status: "delivered" as const,
        attempts: 1,
        createdAt: new Date(state.now - 60000).toISOString(),
        sentAt: new Date(state.now - 60000).toISOString(),
      }),
    }));
    const after = knowYourGuest({
      membershipId: membership.id,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.lastMessage!.worked).toBe(true);
    expect(after.data.lastMessage!.body).toBe("Hello there!");
  });

  it("keeps other restaurants out", () => {
    const state = demoRepo.read();
    const other = state.memberships.find((m) => m.restaurantId === "rest-oak-table")!;
    const know = knowYourGuest({
      membershipId: other.id,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(false);
  });

  it("counts waiting and redeemed rewards", () => {
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.restaurantId === "rest-daily-grind")!;
    const rewards = state.rewards.filter((r) => r.membershipId === membership.id);
    expect(rewards.length).toBeGreaterThanOrEqual(1);
    const know = knowYourGuest({
      membershipId: membership.id,
      restaurantId: "rest-daily-grind",
      session: OWNER,
    });
    expect(know.ok).toBe(true);
    if (!know.ok) return;
    expect(know.data.rewardsWaiting).toBeGreaterThanOrEqual(0);
    expect(know.data.rewardsRedeemed + know.data.rewardsWaiting).toBe(rewards.length);
  });
});
