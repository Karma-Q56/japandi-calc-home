import type { StampEvent } from "@/data/types";

/** All visit pattern maths runs in the restaurant's own time, Africa/Johannesburg. */

export type TimeOfDay = "morning" | "lunch" | "afternoon" | "evening";

export interface VisitPattern {
  visits: number;
  usualDays: number[]; // 0 = Sunday ... 6 = Saturday
  usualTime: TimeOfDay | null;
  averageGapDays: number | null;
  lastVisitDaysAgo: number | null;
  slipping: boolean;
}

const JOBURG = "Africa/Johannesburg";

const dayFormat = buildFormat({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const weekdayFormat = buildFormat({ weekday: "short" });
const hourFormat = buildFormat({ hour: "numeric", hour12: false });

function buildFormat(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: JOBURG, ...options });
}

/** Calendar date keys in Johannesburg, one per visit day. */
export function visitDays(stamps: Pick<StampEvent, "createdAt">[], nowIso: string): string[] {
  const now = Date.parse(nowIso);
  return [
    ...new Set(
      stamps
        .map((stamp) => Date.parse(stamp.createdAt))
        .filter((time) => Number.isFinite(time) && time <= now)
        .map((time) => dayFormat.format(time)),
    ),
  ];
}

export function timeOfDayFor(isoMs: number): TimeOfDay {
  const hour = Number(hourFormat.format(isoMs));
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "afternoon";
  return "evening";
}

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: "mornings",
  lunch: "at lunchtime",
  afternoon: "in the afternoon",
  evening: "in the evening",
};

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function dayName(index: number): string {
  return DAY_NAMES[index] ?? "";
}

/** One pattern per guest, computed only from when their stamps landed. */
export function visitPattern(stamps: Pick<StampEvent, "createdAt">[], nowIso: string): VisitPattern {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) {
    return { visits: 0, usualDays: [], usualTime: null, averageGapDays: null, lastVisitDaysAgo: null, slipping: false };
  }
  const days = visitDays(stamps, nowIso);
  if (days.length === 0) {
    return { visits: 0, usualDays: [], usualTime: null, averageGapDays: null, lastVisitDaysAgo: null, slipping: false };
  }

  // Weekdays, weighted by visit day.
  const weekdayCount = new Array<number>(7).fill(0);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const day of days) {
    const index = weekdayIndex.indexOf(weekdayFormat.format(ekThan(day)));
    if (index >= 0) weekdayCount[index] = (weekdayCount[index] ?? 0) + 1;
  }
  // A usual day is one where the guest came in more than once, or on a third
  // of all their visits once they have a few visits behind them.
  const threshold = days.length < 5 ? 2 : Math.ceil(days.length / 3);
  const usualDays = weekdayCount.map((count, index) => ({ count, index })).filter((entry) => entry.count >= threshold).map((entry) => entry.index);

  // Time of day, weighted by every stamp hour (visits can stack stamps).
  const bucketCount = new Map<TimeOfDay, number>();
  let lastStamp = 0;
  for (const stamp of stamps) {
    const ms = Date.parse(stamp.createdAt);
    if (!Number.isFinite(ms) || ms > now) continue;
    const bucket = timeOfDayFor(ms);
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1);
    if (ms > lastStamp) lastStamp = ms;
  }
  let usualTime: TimeOfDay | null = null;
  let best = 0;
  for (const [bucket, count] of bucketCount) {
    if (count > best || (count === best && usualTime === null)) {
      best = count;
      usualTime = bucket;
    }
  }

  // Average days between visits, skipping gaps longer than six weeks so one
  // long absence does not skew the guest's own rhythm.
  const timestamps = days.map((day) => ekThan(day)).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    const gap = (timestamps[index]! - timestamps[index - 1]!) / 86400000;
    if (Number.isFinite(gap)) gaps.push(gap);
  }
  // Skip gap outliers, so one long absence does not skew the guest's own
  // rhythm when we work out their average days between visits.
  const keptGaps =
    gaps.length >= 3
      ? gaps.filter((gap) => {
          const sorted = [...gaps].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)] as number;
          return gap <= median * 2.5;
        })
      : gaps;
  const usableGaps = keptGaps.length > 0 ? keptGaps : gaps;
  const averageGapDays =
    gaps.length > 0
      ? Math.round((usableGaps.reduce((sum, gap) => sum + gap, 0) / usableGaps.length) * 10) / 10
      : null;

  const lastVisitDaysAgo = Math.max(0, Math.floor((now - lastStamp) / 86400000));
  // Slipping: the quiet stretch since their last visit is much longer than
  // their own usual gap, and long enough to matter at all.
  const slipping =
    averageGapDays !== null &&
    lastVisitDaysAgo > Math.max(5, averageGapDays * 1.5) &&
    lastVisitDaysAgo > averageGapDays * 1.5;

  return { visits: days.length, usualDays, usualTime, averageGapDays, lastVisitDaysAgo, slipping };
}

/** Midnight Johannesburg of a visit day, as a UTC timestamp, for gap maths. */
function ekThan(dayKey: string): number {
  const [year, month, day] = dayKey.split("-");
  if (!year || !month || !day) return NaN;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), 12);
}
