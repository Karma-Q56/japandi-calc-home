import { GAUTENG_SUBURBS } from "@/data/gauteng-suburbs";
import { venueIsOpenNow } from "@/lib/johannesburg-time";

export const FIND_VENUE_TYPES = ["cafe", "bakery", "restaurant", "takeaway", "other"] as const;
export type FindVenueType = (typeof FIND_VENUE_TYPES)[number];

/** Great-circle distance in km between two points. */
export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distance from a chosen suburb to a venue's suburb. Returns undefined when
 * either suburb is unknown, so the card shows no distance rather than a wrong one.
 * Accuracy is about 1 km because suburb centres are approximate.
 */
export function suburbDistanceKm(fromSuburb: string, toSuburb: string | null): number | undefined {
  const from = GAUTENG_SUBURBS.find((s) => s.name === fromSuburb);
  const to = GAUTENG_SUBURBS.find((s) => s.name === toSuburb);
  if (!from || !to) return undefined;
  return distanceKm(from, to);
}

/** Sort rows by distance from a suburb, unknown distances last, then by name. */
export function sortByDistance<T extends { name: string; suburb: string | null }>(
  rows: T[],
  fromSuburb: string,
): T[] {
  return [...rows].sort((a, b) => {
    const da = suburbDistanceKm(fromSuburb, a.suburb) ?? Number.POSITIVE_INFINITY;
    const db = suburbDistanceKm(fromSuburb, b.suburb) ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}

/** Keep one entry per suburb name, in the order given. */
export function uniqueSuburbNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const clean = name?.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}


/** Open now, using the same Johannesburg rules as the venue pages. */
export function isOpenNow(
  hours: Record<string, { open: string; close: string } | null>,
  epochMs: number,
): boolean {
  return venueIsOpenNow(hours, epochMs);
}
