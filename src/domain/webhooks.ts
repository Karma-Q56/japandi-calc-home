import { demoRepo, updateDemo } from "@/data/repo";
import { logAudit } from "./audit";
import { failure, success } from "./demo";
import { withdrawMarketingConsent } from "./members";
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

/** Inbound STOP withdraws marketing for that restaurant's membership only. */
export function handleInboundWebhook(input: {
  provider: string;
  eventId: string;
  fromPhoneE164: string;
  body: string;
  restaurantId: string;
}) {
  if (recordEvent(input.provider, input.eventId) === "duplicate") {
    return success({ deduped: true as const });
  }
  const normalized = input.body.trim().toLowerCase();
  const isStop = STOP_WORDS.some(
    (word) => normalized === word || normalized.startsWith(`${word} `),
  );
  if (!isStop) return success({ deduped: false as const, ignored: true as const });
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => {
    if (item.restaurantId !== input.restaurantId) return false;
    const customer = state.customers.find((candidate) => candidate.id === item.customerId);
    return customer?.phoneE164 === input.fromPhoneE164;
  });
  if (!membership) return success({ deduped: false as const, unknownMember: true as const });
  withdrawMarketingConsent(membership.id, "sms_reply");
  return success({ deduped: false as const, membershipId: membership.id });
}
