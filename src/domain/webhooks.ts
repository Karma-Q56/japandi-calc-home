import { demoRepo, updateDemo } from "@/data/repo";
import { logAudit } from "./audit";
import { failure, success } from "./demo";
import { optOutAllForCustomer, withdrawMarketingConsent } from "./members";
import type { DeliveryStatus } from "./sms";

function recordEvent(provider: string, eventId: string): "new" | "duplicate" {
  const state = demoRepo.read();
  const seen = state.providerEvents.some(
    (event) => event.provider === provider && event.eventId === eventId,
  );
  if (seen) return "duplicate";
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    providerEvents: [
      ...current.providerEvents,
      {
        id: `provider-event-${crypto.randomUUID()}`,
        provider,
        eventId,
        receivedAt: now,
        processedAt: now,
      },
    ],
  }));
  return "new";
}

/**
 * Delivery receipt handling. Idempotent by (provider, event_id):
 * a replayed webhook is a no-op and changes nothing.
 */
export function handleDeliveryWebhook(input: {
  provider: string;
  eventId: string;
  providerMessageId: string;
  status: DeliveryStatus;
  actor?: string;
}) {
  if (recordEvent(input.provider, input.eventId) === "duplicate") {
    return success({ deduped: true as const });
  }
  const state = demoRepo.read();
  const message = state.messages.find(
    (item) =>
      item.providerMessageId === input.providerMessageId || item.id === input.providerMessageId,
  );
  if (!message) return success({ deduped: false as const, unknownMessage: true as const });
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    messages: current.messages.map((item) =>
      item.id === message.id
        ? {
            ...item,
            status: input.status,
            ...(input.status === "delivered" ? { deliveredAt: now } : {}),
          }
        : item,
    ),
  }));
  logAudit({
    actor: input.actor ?? "system",
    action: "sms_webhook",
    restaurantId: message.restaurantId,
    object: message.id,
  });
  return success({ deduped: false as const });
}

const STOP_WORDS = ["stop", "unsubscribe", "remove", "opt out", "optout", "end", "cancel"];

function recordReply(input: {
  restaurantId: string | null;
  toPhoneE164: string;
  body: string;
  kind: "stop" | "stopall" | "info";
  now: number;
}) {
  updateDemo((current) => ({
    ...current,
    smsReplies: [
      ...current.smsReplies,
      {
        id: `reply-${crypto.randomUUID()}`,
        restaurantId: input.restaurantId,
        toPhoneE164: input.toPhoneE164,
        body: input.body,
        kind: input.kind,
        createdAt: new Date(input.now).toISOString(),
      },
    ],
  }));
}

/**
 * Inbound STOP opts the guest out of the venue that messaged them most
 * recently and replies with the exact next step. STOPALL opts out of every
 * venue. Both are idempotent by (provider, eventId).
 */
export function handleInboundWebhook(input: {
  provider: string;
  eventId: string;
  fromPhoneE164: string;
  body: string;
  /** Legacy hint only; STOP now targets the most recent sender. */
  restaurantId?: string;
}) {
  if (recordEvent(input.provider, input.eventId) === "duplicate") {
    return success({ deduped: true as const });
  }
  const normalized = input.body.trim().toLowerCase().replace(/[.!]+$/, "");
  const isStopAll = normalized === "stopall" || normalized === "stop all";
  const isStop =
    !isStopAll &&
    STOP_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `));
  if (!isStop && !isStopAll) {
    return success({ deduped: false as const, ignored: true as const });
  }
  const state = demoRepo.read();
  const customer = state.customers.find(
    (candidate) => candidate.phoneE164 === input.fromPhoneE164,
  );
  if (!customer) return success({ deduped: false as const, unknownMember: true as const });

  if (isStopAll) {
    const all = optOutAllForCustomer(customer.id, "inbound_stopall");
    if (!all.ok) return success({ deduped: false as const, unknownMember: true as const });
    const body = "You're opted out of all Patron venues.";
    recordReply({
      restaurantId: null,
      toPhoneE164: input.fromPhoneE164,
      body,
      kind: "stopall",
      now: state.now,
    });
    return success({
      deduped: false as const,
      kind: "stopall" as const,
      membershipIds: all.data.membershipIds,
      reply: body,
    });
  }

  // Most recent outbound message to this phone decides which venue STOP targets.
  const mine = state.memberships.filter((item) => item.customerId === customer.id);
  const messages = state.messages
    .filter(
      (message) =>
        message.customerId === customer.id &&
        (message.status === "sent" || message.status === "delivered") &&
        mine.some((membership) => membership.id === message.membershipId),
    )
    .sort((a, b) =>
      (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt),
    );
  const last = messages[0];
  const target =
    mine.find((item) => item.id === last?.membershipId) ??
    mine.find((item) => item.restaurantId === input.restaurantId) ??
    [...mine].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))[0];
  if (!target) return success({ deduped: false as const, unknownMember: true as const });
  withdrawMarketingConsent(target.id, "sms_reply");
  const restaurant = state.restaurants.find((item) => item.id === target.restaurantId);
  const body = restaurant
    ? `You're opted out of ${restaurant.name}. Reply STOPALL to opt out of all Patron venues.`
    : "You're opted out. Reply STOPALL to opt out of all Patron venues.";
  recordReply({
    restaurantId: target.restaurantId,
    toPhoneE164: input.fromPhoneE164,
    body,
    kind: "stop",
    now: state.now,
  });
  return success({
    deduped: false as const,
    kind: "stop" as const,
    membershipId: target.id,
    restaurantId: target.restaurantId,
    reply: body,
  });
}
