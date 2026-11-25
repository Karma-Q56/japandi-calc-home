import { GAUTENG_SUBURBS } from "@/data/gauteng-suburbs";
import { FIND_VENUE_TYPES, type FindVenueType } from "@/lib/live-find";

/** What an owner types is checked here first and again in the database (migration 0039). Keep both in step. */

export const SUBURB_MESSAGE = "Use 2 to 60 letters for the neighbourhood.";
export const ADDRESS_MESSAGE =
  "Enter your street address, for example 12 Oxford Road. Leave it empty if you would rather not show it.";
export const VENUE_TYPE_MESSAGE = "Choose what kind of place it is.";

export const SUBURB_MAX = 60;
export const ADDRESS_MAX = 200;

export const VENUE_TYPE_LABELS: Record<FindVenueType, string> = {
  cafe: "Cafe",
  bakery: "Bakery",
  restaurant: "Restaurant",
  takeaway: "Takeaway",
  other: "Other",
};

/** Trim, collapse inner spaces and use the official spelling when the name is on the Gauteng list. */
export function normaliseSuburb(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const official = GAUTENG_SUBURBS.find((suburb) => suburb.name.toLowerCase() === cleaned.toLowerCase());
  return official ? official.name : cleaned;
}

/** Null when fine, else the message to show. */
export function validateSuburb(text: string): string | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > SUBURB_MAX) return SUBURB_MESSAGE;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u.test(cleaned)) return SUBURB_MESSAGE;
  return null;
}

export function isVenueType(value: unknown): value is FindVenueType {
  return typeof value === "string" && (FIND_VENUE_TYPES as readonly string[]).includes(value);
}

/** Null when fine, else the message to show. */
export function validateVenueType(value: unknown): string | null {
  return isVenueType(value) ? null : VENUE_TYPE_MESSAGE;
}

/**
 * Null when fine, else the message to show. Empty is allowed. `max` is 200 on Settings and 120 on Your page
 * (the page save has always capped the address at 120).
 */
export function validateAddress(text: string, max: number = ADDRESS_MAX): string | null {
  const value = text.trim();
  if (value === "") return null;
  if (value.length < 5 || value.length > max) return ADDRESS_MESSAGE;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return ADDRESS_MESSAGE;
  const lower = value.toLowerCase();
  if (lower.includes("http") || lower.includes("www.") || value.includes("@")) return ADDRESS_MESSAGE;
  if (/[0-9]{9,}/.test(value)) return ADDRESS_MESSAGE;
  return null;
}

/** Kept apart so a screen can tell "Somewhere else" from a listed neighbourhood. */
export function isListedSuburb(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, " ").toLowerCase();
  return cleaned !== "" && GAUTENG_SUBURBS.some((suburb) => suburb.name.toLowerCase() === cleaned);
}
