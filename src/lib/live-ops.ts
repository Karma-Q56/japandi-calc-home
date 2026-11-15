// Browser-safe helpers for the operator console (D18). No server imports here.

export const RESTAURANT_STATUSES = ["draft", "active", "paused", "closed"] as const;
export const PLAN_TIERS = ["starter", "managed", "partner", "custom"] as const;
export const CREDIT_ENTRY_TYPES = ["topup", "adjustment"] as const;

export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];
export type PlanTier = (typeof PLAN_TIERS)[number];
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

/** Plain words for each status, for restaurant owners and staff. */
export const STATUS_LABEL: Record<RestaurantStatus, string> = {
  draft: "Not live yet",
  active: "Live",
  paused: "Paused",
  closed: "Closed",
};

export const PLAN_LABEL: Record<PlanTier, string> = {
  starter: "Starter",
  managed: "Managed",
  partner: "Partner",
  custom: "Custom",
};

/** Max credit change in one go: R100 000 in cents. Must match the server limit. */
export const MAX_CREDIT_CENTS = 10_000_000;

/** Rands text to whole cents. Returns null when it is not a plain amount above zero. */
export function parseRands(input: string): number | null {
  const clean = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Whole cents to a rand string with a space as thousands separator, e.g. R1 250.50. */
export function formatRands(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}R${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}

/** Turn a restaurant name into a web address. Matches the server rule: lowercase, digits, single dashes. */
export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** True when the slug is allowed to save. Mirrors bad_slug in src/server/live-ops.ts. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** A reason is required for money and switches: 3 to 200 characters once trimmed. */
export function isValidReason(reason: string): boolean {
  const n = reason.trim().length;
  return n >= 3 && n <= 200;
}

/** Reference for a credit add. A fresh one is made per form open, so a double click adds once. */
export function newCreditReference(now: number, random: () => number): string {
  return `ops-${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`.slice(0, 80);
}
