import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { countSegments, SEGMENT_TEST_VECTORS } from "@/lib/segments";
import {
  fakeSmsProvider,
  getSmsProvider,
  sendmodeProvider,
  smsSouthAfricaProvider,
} from "@/domain/sms";
import { handleDeliveryWebhook, handleInboundWebhook } from "@/domain/webhooks";
import { joinRestaurant } from "@/domain/members";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("segment counting vectors from SPEC 9.2", () => {
  for (const vector of SEGMENT_TEST_VECTORS) {
    it(vector.description, () => {
      expect(countSegments(vector.input)).toBe(vector.expected);
    });
  }
});

describe("provider selection", () => {
  it("defaults to the fake demo provider", () => {
    expect(getSmsProvider().name).toBe("fake");
  });

  it("stub adapters throw not configured until the founder decides", () => {
    expect(() =>
      smsSouthAfricaProvider.send({ restaurantId: "r", customerId: "c", body: "hi" }),
    ).toThrow("not configured");
    expect(() =>
      sendmodeProvider.send({ restaurantId: "r", customerId: "c", body: "hi" }),
    ).toThrow("not configured");
    expect(() => smsSouthAfricaProvider.verifyWebhook(null, "")).toThrow("not configured");
    expect(() => sendmodeProvider.parseDeliveryWebhook({})).toThrow("not configured");
  });

  it("the fake provider parses and verifies demo webhooks", () => {
    const delivery = fakeSmsProvider.parseDeliveryWebhook({
      eventId: "evt-1",
      providerMessageId: "message-1",
      status: "delivered",
    });
    expect(delivery).toEqual({ eventId: "evt-1", providerMessageId: "message-1", status: "delivered" });
    const inbound = fakeSmsProvider.parseInboundWebhook({
      eventId: "evt-2",
      from: "+27821234567",
      body: "STOP",
    });
    expect(inbound.from).toBe("+27821234567");
    expect(fakeSmsProvider.verifyWebhook(null, "")).toBe(true);
  });
});

describe("delivery webhooks", () => {
  it("a replayed delivery webhook changes nothing", () => {
    const sent = fakeSmsProvider.send({
      restaurantId: "rest-daily-grind",
      customerId: "customer-1",
      body: "Hello",
    });
    updateProviderId(sent.id);
    const first = handleDeliveryWebhook({
      provider: "fake",
      eventId: "evt-1",
      providerMessageId: "fake-1",
      status: "delivered",
    });
    expect(first.ok && first.data.deduped).toBe(false);
    const afterFirst = messageStatus(sent.id);
    const replay = handleDeliveryWebhook({
      provider: "fake",
      eventId: "evt-1",
      providerMessageId: "fake-1",
      status: "failed",
    });
    expect(replay.ok && replay.data.deduped).toBe(true);
    expect(messageStatus(sent.id)).toBe(afterFirst);
    expect(demoRepo.read().providerEvents).toHaveLength(1);
  });
});

describe("OTP cost logging", () => {
  it("a new join logs one OTP entry at the configured cost", () => {
    const before = demoRepo.read().otpSendLog.length;
    const joined = joinRestaurant({
      slug: "daily-grind",
      name: "Test Guest",
      phone: "+27820001111",
      marketingSms: true,
      source: "qr",
    });
    expect(joined.ok).toBe(true);
    const log = demoRepo.read().otpSendLog;
    expect(log.length).toBe(before + 1);
    expect(log[log.length - 1]!.costCents).toBe(30);
    expect(log[log.length - 1]!.phoneHash).not.toContain("27820001111");
  });
});

describe("inbound STOP", () => {
  it("withdraws marketing for that restaurant only", () => {
    const state = demoRepo.read();
    const daily = state.memberships.find((m) => m.restaurantId === "rest-daily-grind")!;
    const other = state.memberships.find(
      (m) => m.customerId === daily.customerId && m.restaurantId !== "rest-daily-grind",
    );
    const customer = state.customers.find((c) => c.id === daily.customerId)!;
    // Guarantee opted-in starting points for the assertion.
    setOptedIn(daily.id);
    if (other) setOptedIn(other.id);
    const result = handleInboundWebhook({
      provider: "fake",
      eventId: "evt-stop-1",
      fromPhoneE164: customer.phoneE164,
      body: "STOP",
      restaurantId: "rest-daily-grind",
    });
    expect(result.ok).toBe(true);
    const after = demoRepo.read();
    expect(after.memberships.find((m) => m.id === daily.id)!.marketingSms).toBe(false);
    if (other) {
      expect(after.memberships.find((m) => m.id === other.id)!.marketingSms).toBe(true);
    }
  });
});

function updateProviderId(messageId: string) {
  updateDemo((current) => ({
    ...current,
    messages: current.messages.map((item) =>
      item.id === messageId ? { ...item, providerMessageId: "fake-1" } : item,
    ),
  }));
}

function messageStatus(messageId: string) {
  return demoRepo.read().messages.find((item) => item.id === messageId)!.status;
}

function setOptedIn(membershipId: string) {
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.id === membershipId ? { ...item, marketingSms: true } : item,
    ),
  }));
}
