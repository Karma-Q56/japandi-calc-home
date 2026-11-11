// Pure rules for live sending (phase D16). No database or network access here, so these
// are unit tested directly. The server modules call these helpers.

import { STOP_FOOTER, inQuietHours, nextEightAm, renderBody } from "@/domain/campaigns";

/** Words a guest can text to withdraw marketing consent. Matched on the whole message. */
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

/** True when an inbound SMS is an opt-out keyword (case and spacing ignored). */
export function isStopReply(body: string): boolean {
  const word = body.trim().replace(/[.!\s]+$/u, "").toLowerCase();
  return STOP_WORDS.has(word);
}

/**
 * When a due message should go out. Messages due during quiet hours wait until 08:00 SAST.
 * Returns the epoch ms to send at, which is `now` when sending is allowed.
 */
export function sendAtOrDefer(nowMs: number): number {
  return inQuietHours(nowMs) ? nextEightAm(nowMs) : nowMs;
}

/** The body actually sent: the campaign copy plus the STOP footer, once. Always ends with the footer. */
export function withStopFooter(body: string): string {
  return body.trimEnd().endsWith(STOP_FOOTER.trim()) ? body : `${body}${STOP_FOOTER}`;
}

/** First word of the guest's name for "Hi {first_name}", or a friendly fallback when there is no name. */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/u)[0] ?? "";
  return first.length > 0 ? first : "friend";
}

/** The text a guest receives: fill-ins replaced, then the STOP line. */
export function guestMessage(template: string, name: string | null | undefined): string {
  return withStopFooter(renderBody(template, firstNameOf(name)));
}

/** Retry rule: a message can be attempted again until it has used MAX_ATTEMPTS tries. */
export function canRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

/** Normalise a South African mobile number to E.164 digits, or null when it is not usable. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("27")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+27${digits.slice(1)}`;
  return null;
}
