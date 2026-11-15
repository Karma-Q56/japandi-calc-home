// Phase D17: the channel shape shared by web push now and WhatsApp later.
// A channel sends one message to one subscription and reports what happened.
// The caller decides what to do: "gone" removes the subscription, "retry" tries again later.

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

export type SendOutcome = "delivered" | "gone" | "retry" | "failed";

export interface PushChannel {
  send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendOutcome>;
}

/** Map an HTTP status from a push service to an outcome. Exported for tests. */
export function outcomeForStatus(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "retry";
  return "failed";
}
