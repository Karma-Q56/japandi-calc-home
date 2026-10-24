import { demoRepo, updateDemo } from "@/data/repo";
import type { Message } from "@/data/types";
import { countSegments } from "@/lib/segments";
import { withdrawMarketingConsent } from "./members";

export type DeliveryStatus = "delivered" | "failed";
export type SmsProviderName = "console" | "fake" | "smssouthafrica" | "sendmode" | "bulksms";

/** SPEC 9.1 provider contract. Real backends arrive in M9; the demo uses FakeSmsProvider. */
export interface SmsProvider {
  readonly name: SmsProviderName;
  send(input: { restaurantId: string; customerId: string; body: string }): Message;
  parseDeliveryWebhook(payload: unknown): {
    eventId: string;
    providerMessageId: string;
    status: DeliveryStatus;
  };
  parseInboundWebhook(payload: unknown): { eventId: string; from: string; body: string };
  verifyWebhook(signature: string | null, rawBody: string): boolean;
}

function segmentCount(body: string) {
  return Math.max(1, countSegments(body));
}

function notConfigured(name: string): Error {
  return new Error(`${name} is not configured yet, the founder has not picked a provider.`);
}

export class FakeSmsProvider implements SmsProvider {
  readonly name = "fake" as const;

  send(input: { restaurantId: string; customerId: string; body: string }) {
    const state = demoRepo.read();
    const segments = segmentCount(input.body);
    const message: Message = {
      id: `message-${crypto.randomUUID()}`,
      restaurantId: input.restaurantId,
      customerId: input.customerId,
      channel: "sms",
      body: input.body,
      segments,
      costCents: 35 * segments,
      status: "queued",
      attempts: 0,
      provider: "fake",
      createdAt: new Date(state.now).toISOString(),
    };
    updateDemo((current) => ({ ...current, messages: [...current.messages, message] }));
    return message;
  }

  parseDeliveryWebhook(payload: unknown) {
    const event = payload as {
      eventId?: unknown;
      providerMessageId?: unknown;
      messageId?: unknown;
      status?: unknown;
    };
    const providerMessageId = event.providerMessageId ?? event.messageId;
    if (typeof event.eventId !== "string" || typeof providerMessageId !== "string") {
      throw new Error("Malformed fake delivery webhook.");
    }
    return {
      eventId: event.eventId,
      providerMessageId,
      status: (event.status === "failed" ? "failed" : "delivered") as DeliveryStatus,
    };
  }

  parseInboundWebhook(payload: unknown) {
    const event = payload as { eventId?: unknown; from?: unknown; body?: unknown };
    if (typeof event.eventId !== "string" || typeof event.from !== "string") {
      throw new Error("Malformed fake inbound webhook.");
    }
    return { eventId: event.eventId, from: event.from, body: String(event.body ?? "") };
  }

  verifyWebhook(_signature: string | null, _rawBody: string) {
    void _signature;
    void _rawBody;
    return true;
  }

  simulateDelivery(messageId: string): DeliveryStatus | null {
    const state = demoRepo.read();
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return null;
    const failed = Number.parseInt(message.id.replace(/\D/g, "").slice(-1) || "0", 10) % 4 === 0;
    const status = failed ? ("failed" as const) : ("delivered" as const);
    updateDemo((current) => ({
      ...current,
      messages: current.messages.map((item) =>
        item.id === messageId ? { ...item, status } : item,
      ),
    }));
    return status;
  }

  replyStop(customerId: string, restaurantId: string) {
    const membership = demoRepo
      .read()
      .memberships.find(
        (item) => item.customerId === customerId && item.restaurantId === restaurantId,
      );
    return membership ? withdrawMarketingConsent(membership.id, "sms_reply") : null;
  }
}

export const fakeSmsProvider = new FakeSmsProvider();

/** Stub adapters throw until the founder picks and configures a real provider. */
class UnconfiguredProvider implements SmsProvider {
  readonly name: SmsProviderName;
  private readonly label: string;
  constructor(name: SmsProviderName, label: string) {
    this.name = name;
    this.label = label;
  }
  send(_input: { restaurantId: string; customerId: string; body: string }): Message {
    void _input;
    throw notConfigured(this.label);
  }
  parseDeliveryWebhook(_payload: unknown): never {
    void _payload;
    throw notConfigured(this.label);
  }
  parseInboundWebhook(_payload: unknown): never {
    void _payload;
    throw notConfigured(this.label);
  }
  verifyWebhook(_signature: string | null, _rawBody: string): never {
    void _signature;
    void _rawBody;
    throw notConfigured(this.label);
  }
}

export const smsSouthAfricaProvider = new UnconfiguredProvider(
  "smssouthafrica",
  "smssouthafrica",
);
export const sendmodeProvider = new UnconfiguredProvider("sendmode", "sendmode");
/** Chosen provider (founder has a BulkSMS.com account). The real adapter is src/server/sms/BulkSmsProvider.ts. */
export const bulksmsProvider = new UnconfiguredProvider("bulksms", "bulksms (demo build: real sending arrives with the backend)");

/** SMS_PROVIDER=console|fake|smssouthafrica|sendmode (default fake; console is the demo outbox). */
export function smsProviderName(): SmsProviderName {
  const raw = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
    "SMS_PROVIDER"
  ] ?? "fake").toLowerCase();
  if (raw === "console" || raw === "fake" || raw === "smssouthafrica" || raw === "sendmode" || raw === "bulksms") {
    return raw;
  }
  return "fake";
}

export function getSmsProvider(): SmsProvider {
  const name = smsProviderName();
  if (name === "smssouthafrica") return smsSouthAfricaProvider;
  if (name === "sendmode") return sendmodeProvider;
  if (name === "bulksms") return bulksmsProvider;
  return fakeSmsProvider;
}
