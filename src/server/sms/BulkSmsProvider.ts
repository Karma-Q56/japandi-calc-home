// BulkSMS.com adapter (https://www.bulksms.com/developer/json/v1/).
// Runs on Workers: uses fetch and WebCrypto-free string compare only.
//
// UNVERIFIED against a live account (see docs/decisions.md):
//  - exact status.type values beyond DELIVERED / FAILED / SENT / ACCEPTED
//  - whether an alphanumeric sender ID is accepted on the founder's account and routing group
//  - credit-to-rand conversion (BulkSMS reports creditCost in credits, not rand)

import type {
  SmsDeliveryEvent,
  SmsInboundEvent,
  SmsMessage,
  SmsProvider,
  SmsSendResult,
} from "./types";

export interface BulkSmsConfig {
  /** API token id (recommended) or account username. */
  tokenId: string;
  /** API token secret (or account password). Never log this. */
  tokenSecret: string;
  /** Shared secret appended to webhook URLs as ?secret=... (BulkSMS does not sign requests). */
  webhookSecret: string;
  /** Default sender, e.g. a registered alphanumeric ID or a dedicated number. */
  defaultFrom?: string;
  /** Rand per BulkSMS credit, used to estimate costCents. Omit to leave cost unknown. */
  randPerCredit?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface BulkSmsMessage {
  id?: string;
  type?: string;
  from?: string;
  to?: string;
  body?: string;
  numberOfParts?: number;
  creditCost?: number;
  relatedSentMessageId?: string;
  submission?: { id?: string; date?: string };
  status?: { id?: string; type?: string; subtype?: string | null };
}

/** Constant-time string compare so the webhook secret cannot be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function mapBulkSmsStatus(type: string | undefined): SmsDeliveryEvent["status"] | null {
  switch ((type ?? "").toUpperCase()) {
    case "DELIVERED":
      return "delivered";
    case "FAILED":
    case "REJECTED":
    case "UNDELIVERED":
      return "failed";
    case "SENT":
      return "sent";
    default:
      return null; // ACCEPTED, SCHEDULED and similar are not terminal; ignore them.
  }
}

function toE164Digits(value: string): string {
  // BulkSMS accepts and returns international numbers, with or without a leading +.
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : value;
}

async function readJsonArray(req: Request): Promise<BulkSmsMessage[]> {
  const raw: unknown = await req.json().catch(() => []);
  return Array.isArray(raw) ? (raw as BulkSmsMessage[]) : [];
}

export class BulkSmsProvider implements SmsProvider {
  name = "bulksms";
  private readonly config: BulkSmsConfig;
  private readonly doFetch: typeof fetch;

  constructor(config: BulkSmsConfig) {
    this.config = config;
    this.doFetch = config.fetchImpl ?? fetch;
  }

  private authHeader(): string {
    return `Basic ${btoa(`${this.config.tokenId}:${this.config.tokenSecret}`)}`;
  }

  async send(msg: SmsMessage): Promise<SmsSendResult> {
    const from = msg.from ?? this.config.defaultFrom;
    const payload = {
      to: msg.to.replace(/\s+/g, ""),
      body: msg.body,
      ...(from ? { from } : {}),
      // Lets us match delivery reports back to our own message row.
      userSuppliedId: msg.reference.slice(0, 36),
    };
    const response = await this.doFetch(`${this.config.baseUrl ?? "https://api.bulksms.com/v1"}/messages`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      // Log status only: the body may echo the number or message text.
      throw new Error(`BulkSMS send failed with HTTP ${response.status}`);
    }
    const result: unknown = await response.json().catch(() => null);
    const first = (Array.isArray(result) ? result[0] : result) as BulkSmsMessage | undefined;
    if (!first?.id) throw new Error("BulkSMS send returned no message id");
    const credits = typeof first.creditCost === "number" ? first.creditCost : undefined;
    const { randPerCredit } = this.config;
    return {
      providerMessageId: first.id,
      ...(first.numberOfParts !== undefined ? { segments: first.numberOfParts } : {}),
      ...(credits !== undefined && randPerCredit !== undefined
        ? { costCents: Math.round(credits * randPerCredit * 100) }
        : {}),
    };
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    const secret = new URL(req.url).searchParams.get("secret") ?? "";
    return this.config.webhookSecret.length > 0 && safeEqual(secret, this.config.webhookSecret);
  }

  async parseDeliveryWebhook(req: Request): Promise<SmsDeliveryEvent[]> {
    const items = await readJsonArray(req);
    const events: SmsDeliveryEvent[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const status = mapBulkSmsStatus(item.status?.type);
      if (!status) continue;
      const at = item.submission?.date ? new Date(item.submission.date) : new Date();
      events.push({
        providerMessageId: item.id,
        status,
        ...(status === "failed" && item.status?.id ? { errorCode: item.status.id } : {}),
        at: Number.isNaN(at.getTime()) ? new Date() : at,
      });
    }
    return events;
  }

  async parseInboundWebhook(req: Request): Promise<SmsInboundEvent[]> {
    const items = await readJsonArray(req);
    const events: SmsInboundEvent[] = [];
    for (const item of items) {
      if ((item.type ?? "").toUpperCase() !== "RECEIVED" || !item.from) continue;
      const at = item.submission?.date ? new Date(item.submission.date) : new Date();
      events.push({
        from: toE164Digits(item.from),
        body: item.body ?? "",
        at: Number.isNaN(at.getTime()) ? new Date() : at,
      });
    }
    return events;
  }
}
