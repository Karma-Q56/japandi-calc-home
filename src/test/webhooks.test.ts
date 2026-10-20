import { beforeEach, describe, expect, it } from "vitest";

import { demoRepo, updateDemo } from "@/data/repo";
import { handleInboundWebhook } from "@/domain/webhooks";

const message = (input: {
  id: string;
  restaurantId: string;
  customerId: string;
  membershipId: string;
  sentAt: string;
}) => ({
  id: input.id,
  restaurantId: input.restaurantId,
  customerId: input.customerId,
  membershipId: input.membershipId,
  channel: "sms" as const,
  body: "A little treat from us.",
  segments: 1,
  costCents: 45,
  status: "delivered" as const,
  attempts: 1,
  createdAt: input.sentAt,
  sentAt: input.sentAt,
});

beforeEach(() => {
  demoRepo.reset();
});

/** A guest with two cards and a delivered SMS at each venue. */
function twoVenueGuest() {
  const state = demoRepo.read();
  const customer = state.customers.find(
    (item) => state.memberships.filter((m) => m.customerId === item.id).length >= 2,
  )!;
  const memberships = state.memberships.filter((item) => item.customerId === customer.id);
  const first = memberships[0]!;
  const second = memberships[1]!;
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.customerId === customer.id ? { ...item, marketingSms: true } : item,
    ),
    messages: [
      ...current.messages,
      message({
        id: "sms-first",
        restaurantId: first.restaurantId,
        customerId: customer.id,
        membershipId: first.id,
        sentAt: new Date(state.now - 2 * 3600000).toISOString(),
      }),
      message({
        id: "sms-second",
        restaurantId: second.restaurantId,
        customerId: customer.id,
        membershipId: second.id,
        sentAt: new Date(state.now - 3600000).toISOString(),
      }),
    ],
  }));
  return { customer, first, second };
}

describe("inbound SMS opt-outs", () => {
  it("STOP opts out of the venue that messaged most recently and replies with the next step", () => {
    const { customer, first, second } = twoVenueGuest();
    const result = handleInboundWebhook({
      provider: "dev",
      eventId: "evt-stop-1",
      fromPhoneE164: customer.phoneE164,
      body: "STOP",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !("kind" in result.data)) return;
    expect(result.data.kind).toBe("stop");

    const state = demoRepo.read();
    expect(state.memberships.find((m) => m.id === second.id)?.marketingSms).toBe(false);
    expect(state.memberships.find((m) => m.id === first.id)?.marketingSms).toBe(true);
    const restaurant = state.restaurants.find((item) => item.id === second.restaurantId)!;
    const reply = state.smsReplies.at(-1)!;
    expect(reply.kind).toBe("stop");
    expect(reply.restaurantId).toBe(second.restaurantId);
    expect(reply.body).toBe(
      `You're opted out of ${restaurant.name}. Reply STOPALL to opt out of all Patron venues.`,
    );
    expect(result.data.reply).toBe(reply.body);
  });

  it("STOPALL opts out of every venue and says so", () => {
    const { customer } = twoVenueGuest();
    const result = handleInboundWebhook({
      provider: "dev",
      eventId: "evt-stopall-1",
      fromPhoneE164: customer.phoneE164,
      body: "stop all",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !("kind" in result.data)) return;
    expect(result.data.kind).toBe("stopall");
    const state = demoRepo.read();
    const mine = state.memberships.filter((item) => item.customerId === customer.id);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((item) => item.marketingSms === false)).toBe(true);
    const reply = state.smsReplies.at(-1)!;
    expect(reply.kind).toBe("stopall");
    expect(reply.restaurantId).toBeNull();
    expect(reply.body).toBe("You're opted out of all Patron venues.");
  });

  it("replays the same provider event without a second opt-out", () => {
    const { customer } = twoVenueGuest();
    const event = {
      provider: "dev",
      eventId: "evt-stop-dupe",
      fromPhoneE164: customer.phoneE164,
      body: "STOP",
    };
    handleInboundWebhook(event);
    const before = demoRepo.read().smsReplies.length;
    const replay = handleInboundWebhook(event);
    expect(replay.ok && replay.data.deduped).toBe(true);
    expect(demoRepo.read().smsReplies.length).toBe(before);
  });

  it("ignores other replies without changing consent", () => {
    const { customer } = twoVenueGuest();
    const result = handleInboundWebhook({
      provider: "dev",
      eventId: "evt-info-1",
      fromPhoneE164: customer.phoneE164,
      body: "Thanks!",
    });
    expect(result.ok && "ignored" in result.data && result.data.ignored).toBe(true);
    const state = demoRepo.read();
    expect(
      state.memberships.filter((m) => m.customerId === customer.id).every((m) => m.marketingSms),
    ).toBe(true);
  });
});
