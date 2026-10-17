import { demoRepo, updateDemo } from "@/data/repo";
import type { Message } from "@/data/types";
import { countSegments } from "@/lib/segments";
import { withdrawMarketingConsent } from "./members";

export interface SmsProvider {
  send(input: { restaurantId: string; customerId: string; body: string }): Message;
  simulateDelivery(messageId: string): "delivered" | "failed" | null;
}

function segmentCount(body: string) {
  return Math.max(1, countSegments(body));
}

export class FakeSmsProvider implements SmsProvider {
  send(input: { restaurantId: string; customerId: string; body: string }) {
    const state = demoRepo.read();
    const segments = segmentCount(input.body);
    const message: Message = {
      id: `message-${crypto.randomUUID()}`,
      restaurantId: input.restaurantId,
      customerId: input.customerId,
      body: input.body,
      segments,
      costCents: 35 * segments,
      status: "queued",
      createdAt: new Date(state.now).toISOString(),
    };
    updateDemo((current) => ({ ...current, messages: [...current.messages, message] }));
    return message;
  }

  simulateDelivery(messageId: string) {
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
