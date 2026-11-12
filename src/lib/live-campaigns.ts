// Shared, browser-safe rules for live campaigns (D15).
// Cost uses the demo's COST_PER_SEGMENT_CENTS, so the estimate matches the demo.

import { COST_PER_SEGMENT_CENTS, STOP_FOOTER } from "@/domain/campaigns";

export type CampaignMessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped";

export type CampaignTotals = {
  delivered: number;
  sent: number;
  failed: number;
  queued: number;
  skipped: number;
};

/** Count message statuses once, so the live results page and tests agree. */
export function campaignTotals(statuses: CampaignMessageStatus[]): CampaignTotals {
  const totals: CampaignTotals = { delivered: 0, sent: 0, failed: 0, queued: 0, skipped: 0 };
  for (const status of statuses) {
    if (status === "sending" || status === "queued") totals.queued += 1;
    else totals[status] += 1;
  }
  return totals;
}

export function messageStatusText(status: CampaignMessageStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}

export const LOW_CREDIT_CENTS = 5000; // R50 warning line

export const MESSAGE_MAX = 600;
export const CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

export const AUDIENCE_TYPES = ["everyone", "new", "lapsed30", "close_to_reward", "weekday", "birthday_month", "saved_list"] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

/** Whole-cent estimate: recipients times segments times the per-segment price. */
export function estimateCostCents(recipients: number, segments: number): number {
  return Math.max(0, Math.round(recipients)) * Math.max(0, Math.round(segments)) * COST_PER_SEGMENT_CENTS;
}

/** Format cents as rands for display, for example 1250 becomes "R12.50". */
export function formatRand(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const rands = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}R${rands}.${rest}`;
}

/** Parse a rand amount typed by the owner ("500", "12.5", "R1 200") into whole cents. Null when not a positive amount. */
export function parseRandToCents(input: string): number | null {
  const cleaned = input.replace(/[R\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

/** The message as a guest reads it: the owner's text plus the opt-out footer. */
export function withFooter(body: string): string {
  return `${body}${STOP_FOOTER}`;
}

/** Plain wording for each credit ledger entry type. */
export function ledgerWording(entryType: string): string {
  switch (entryType) {
    case "topup":
      return "Credit added";
    case "reserve":
      return "Set aside for a campaign";
    case "release":
      return "Set aside was returned";
    case "charge":
      return "Used for messages sent";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment by Patron";
    default:
      return "Credit change";
  }
}

/** Whether the balance is low enough to warn the owner. */
export const isLowCredit = (availableCents: number): boolean => availableCents < LOW_CREDIT_CENTS;

/** A long first name used to count text segments, so the credit held is never too small. */
export const SEGMENT_SAMPLE_NAME = "Nonhlanhla";

/** The ways a live campaign can go out. Push is free; "both" tries push first and texts only when push fails. */
export const LIVE_CHANNELS = ["sms", "push", "both"] as const;
export type LiveChannel = (typeof LIVE_CHANNELS)[number];

export type ReachCounts = { sms: number; push: number; either: number };

export const CHANNEL_CHOICES: Array<{ channel: LiveChannel; title: string; hint: string }> = [
  { channel: "push", title: "Push notification (free)", hint: "Guests who installed your card and allow notifications. It costs nothing." },
  { channel: "sms", title: "Text message", hint: "Any guest who said yes to texts. Each text costs credit." },
  { channel: "both", title: "Push first, then a text", hint: "A text is sent only to guests the push could not reach." },
];

/** Guests a campaign can reach on the chosen channel. */
export function reachFor(channel: LiveChannel, counts: ReachCounts): number {
  if (channel === "push") return counts.push;
  if (channel === "sms") return counts.sms;
  return counts.either;
}

/**
 * Credit held for the campaign. Push costs nothing. A text campaign holds every text it might send.
 * "Both" holds the text worst case too, because every guest could end up on text. What is not used comes back.
 */
export function heldCostCents(channel: LiveChannel, counts: ReachCounts, segments: number): number {
  return channel === "push" ? 0 : estimateCostCents(counts.sms, segments);
}
