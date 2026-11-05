/**
 * Pure helpers for the owner Home screen. Days and hours are counted in
 * Johannesburg time (SAST, UTC+2, no daylight saving), matching the domain.
 */

const DAY = 86400000;
const SAST = 2 * 3600000;

export type HomeMetric = "visits" | "unique" | "new" | "sales";
export type HomeRange = 7 | 14 | 30;

export interface StampLike {
  membershipId: string;
  createdAt: string;
  status: "valid" | "undone";
}

export interface MembershipLike {
  id: string;
  customerId: string;
  joinedAt: string;
  stampsCurrent: number;
  lastVisitAt: string | null;
}

/** Start of the SAST day that contains `timestamp`, as epoch ms. */
export function sastDayStart(timestamp: number): number {
  return Math.floor((timestamp + SAST) / DAY) * DAY - SAST;
}

/** Hour of day (0-23) in Johannesburg time. */
export function sastHour(timestamp: number): number {
  return Math.floor(((timestamp + SAST) % DAY) / 3600000);
}

export interface DailyPoint {
  /** SAST day start, epoch ms. */
  day: number;
  visits: number;
  unique: number;
  newMembers: number;
}

/**
 * One point per day for the last `range` days, oldest first. Days with no
 * activity stay as zero points so the chart keeps its shape.
 */
export function dailySeries(
  stamps: StampLike[],
  memberships: MembershipLike[],
  now: number,
  range: number,
): DailyPoint[] {
  const today = sastDayStart(now);
  const days = Array.from({ length: range }, (_, i) => today - (range - 1 - i) * DAY);
  const points = new Map<number, { visits: number; guests: Set<string> }>();
  for (const day of days) points.set(day, { visits: 0, guests: new Set() });
  for (const stamp of stamps) {
    if (stamp.status !== "valid") continue;
    const bucket = points.get(sastDayStart(new Date(stamp.createdAt).getTime()));
    if (!bucket) continue;
    bucket.visits += 1;
    bucket.guests.add(stamp.membershipId);
  }
  const joinCounts = new Map<number, number>();
  for (const membership of memberships) {
    const day = sastDayStart(new Date(membership.joinedAt).getTime());
    joinCounts.set(day, (joinCounts.get(day) ?? 0) + 1);
  }
  return days.map((day) => {
    const bucket = points.get(day)!;
    return {
      day,
      visits: bucket.visits,
      unique: bucket.guests.size,
      newMembers: joinCounts.get(day) ?? 0,
    };
  });
}

/** Total of a metric over the series, used for the stat cards. */
export function sumMetric(points: DailyPoint[], metric: HomeMetric): number {
  return points.reduce((total, point) => total + metricValue(point, metric), 0);
}

/**
 * Assumed spend per visit in cents, used only for the "Estimated sales" metric.
 * The app does not record till totals, so the owner sees this stated on the chart.
 */
export const ESTIMATED_SPEND_PER_VISIT_CENTS = 15000;

export function metricValue(point: DailyPoint, metric: HomeMetric): number {
  if (metric === "visits") return point.visits;
  if (metric === "unique") return point.unique;
  if (metric === "new") return point.newMembers;
  return point.visits * ESTIMATED_SPEND_PER_VISIT_CENTS;
}

/** Percent change from `previous` to `current`, or null when there is nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface HourBucket {
  hour: number;
  visits: number;
}

/** Visits per hour of the day for the last `days` days. */
export function busiestHours(stamps: StampLike[], now: number, days = 14): HourBucket[] {
  const from = now - days * DAY;
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 }));
  for (const stamp of stamps) {
    if (stamp.status !== "valid") continue;
    const t = new Date(stamp.createdAt).getTime();
    if (t < from || t > now) continue;
    buckets[sastHour(t)]!.visits += 1;
  }
  return buckets;
}

export interface BusyPeriod {
  /** Lowest hour of the busiest hour, e.g. 12 for 12:00. */
  hour: number;
  visits: number;
}

/** The single busiest hour, or null when nobody has visited. */
export function peakHour(buckets: HourBucket[]): BusyPeriod | null {
  let best: HourBucket | null = null;
  for (const bucket of buckets) {
    if (bucket.visits > 0 && (!best || bucket.visits > best.visits)) best = bucket;
  }
  return best ? { hour: best.hour, visits: best.visits } : null;
}

export interface Regular {
  membershipId: string;
  customerId: string;
  visits: number;
  lastVisitAt: string | null;
}

/** Guests with the most visits in the window, most visits first. */
export function bestRegulars(
  stamps: StampLike[],
  memberships: MembershipLike[],
  now: number,
  limit = 5,
  days = 30,
): Regular[] {
  const from = now - days * DAY;
  const counts = new Map<string, number>();
  for (const stamp of stamps) {
    if (stamp.status !== "valid") continue;
    const t = new Date(stamp.createdAt).getTime();
    if (t < from || t > now) continue;
    counts.set(stamp.membershipId, (counts.get(stamp.membershipId) ?? 0) + 1);
  }
  return memberships
    .filter((m) => (counts.get(m.id) ?? 0) >= 2)
    .map((m) => ({
      membershipId: m.id,
      customerId: m.customerId,
      visits: counts.get(m.id)!,
      lastVisitAt: m.lastVisitAt,
    }))
    .sort((a, b) => b.visits - a.visits || (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""))
    .slice(0, limit);
}

export interface AttentionInput {
  rewardsWaiting: number;
  lapsedGuests: number;
  lowCreditCents: number;
  unpublishedDrafts: number;
}

export interface AttentionItem {
  key: string;
  text: string;
  href: string;
}

/** Plain-language to-dos for the owner. Empty when nothing needs them. */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (input.rewardsWaiting > 0) {
    items.push({
      key: "rewards",
      text: `${input.rewardsWaiting} reward${input.rewardsWaiting === 1 ? " is" : "s are"} waiting to be redeemed at the till.`,
      href: "/app/customers",
    });
  }
  if (input.lapsedGuests > 0) {
    items.push({
      key: "lapsed",
      text: `${input.lapsedGuests} guest${input.lapsedGuests === 1 ? " has" : "s have"} not visited in 30 days.`,
      href: "/app/customers",
    });
  }
  if (input.lowCreditCents < 2000) {
    items.push({
      key: "credit",
      text: "SMS credit is running low. Top up before your next campaign.",
      href: "/app/credit",
    });
  }
  if (input.unpublishedDrafts > 0) {
    items.push({
      key: "drafts",
      text: `${input.unpublishedDrafts} draft${input.unpublishedDrafts === 1 ? "" : "s"} not published yet.`,
      href: "/app/loyalty",
    });
  }
  return items;
}
