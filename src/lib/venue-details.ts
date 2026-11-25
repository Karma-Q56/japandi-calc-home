import type { Restaurant } from "@/data/types";

const TYPE_LABELS: Record<NonNullable<Restaurant["venueType"]>, string> = {
  cafe: "Cafe",
  bakery: "Bakery",
  restaurant: "Restaurant",
  takeaway: "Takeaway",
  other: "Other",
};

/** Friendly labels for the four venue kinds. */
export function venueTypeLabel(venue: Pick<Restaurant, "venueType">): string {
  return venue.venueType ? TYPE_LABELS[venue.venueType] : "Place";
}

/**
 * Older saved demo snapshots predate the phone field. Keep the known demo
 * venues reachable without wiping a guest's saved stamps.
 */
const DEMO_PHONES: Record<string, string> = {
  "daily-grind": "+27821110001",
  "sunrise-bakes": "+27821110002",
  "oak-table": "+27821110003",
};

export function venuePhone(venue: Pick<Restaurant, "slug" | "phoneE164">): string {
  return venue.phoneE164 ?? DEMO_PHONES[venue.slug] ?? "";
}

const DEMO_DISTANCES: Record<string, number> = {
  "daily-grind": 0.6,
  "sunrise-bakes": 1.4,
  "oak-table": 2.2,
};

export function venueDistance(
  venue: Pick<Restaurant, "slug" | "distanceKm">,
): number {
  return venue.distanceKm ?? DEMO_DISTANCES[venue.slug] ?? 9.9;
}

/** Turn a stored +27 number into the local format people read. */
export function formatVenuePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("27") ? `0${digits.slice(2)}` : digits;
  if (local.length === 10) {
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return value;
}

export function whatsappHref(value: string, venueName: string): string {
  const digits = value.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(
    `Hi ${venueName}, I have a question about your loyalty card.`,
  )}`;
}
