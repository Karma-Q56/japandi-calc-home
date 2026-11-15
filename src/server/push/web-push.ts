import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import {
  outcomeForStatus,
  type PushChannel,
  type PushPayload,
  type PushSubscriptionRecord,
  type SendOutcome,
} from "./channel";

// Phase D17: Web Push (RFC 8030 delivery, RFC 8291 encryption, VAPID RFC 8292).
// Uses @block65/webcrypto-web-push (MIT, Web Crypto only), which runs on Cloudflare Workers.

/** A push payload must stay small. Browsers accept about 4 KB; keep well under that. */
export const PUSH_PAYLOAD_LIMIT_BYTES = 3000;

export class PushNotConfiguredError extends Error {
  constructor() {
    super("Push is not set up yet: VAPID keys are missing.");
    this.name = "PushNotConfiguredError";
  }
}

export class PushPayloadTooLargeError extends Error {
  constructor() {
    super("The push message is too large.");
    this.name = "PushPayloadTooLargeError";
  }
}

export type VapidEnv = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

/** Read VAPID keys from the environment. Refuses clearly if any is missing. */
export function readVapid(env: VapidEnv): VapidKeys & { publicKey: string; privateKey: string } {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) throw new PushNotConfiguredError();
  return { publicKey, privateKey, subject };
}

export function encodePayload(payload: PushPayload): string {
  return JSON.stringify({ title: payload.title, body: payload.body, url: payload.url });
}

/** Build a channel that sends through the browser push services. `fetcher` is injectable for tests. */
export function createWebPushChannel(
  vapid: VapidKeys,
  fetcher: typeof fetch = fetch,
): PushChannel {
  return {
    async send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendOutcome> {
      const json = encodePayload(payload);
      if (new TextEncoder().encode(json).byteLength > PUSH_PAYLOAD_LIMIT_BYTES) {
        throw new PushPayloadTooLargeError();
      }
      const message = await buildPushPayload(
        { data: JSON.parse(json), options: { ttl: 60 * 60 * 24, urgency: "normal" } },
        {
          endpoint: subscription.endpoint,
          expirationTime: null,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        vapid,
      );
      const response = await fetcher(subscription.endpoint, {
        method: message.method,
        headers: message.headers,
        body: message.body,
      });
      return outcomeForStatus(response.status);
    },
  };
}
