import { demoRepo } from "@/data/repo";
import { birthdayOf, birthdayLabel } from "@/lib/birthday";
import { dayName, timeOfDayFor, TIME_OF_DAY_LABEL, visitPattern } from "@/lib/visits";
import type { TimeOfDay } from "@/lib/visits";
import { failure, success, type ApiResult } from "./demo";
import { requireScope } from "./audit";

const DAY = 86400000;
const WEEK = 7 * DAY;

export interface BlockDay {
  weekday: number;
  label: string;
  visits: number;
}

export interface BlockTime {
  bucket: TimeOfDay;
  label: string;
  visits: number;
}

export interface GuestRow {
  name: string;
  customerId: string;
  membershipId: string;
  detail: string;
}

export interface Insights {
  busiestDays: BlockDay[];
  busiestTimes: BlockTime[];
  quietDays: BlockDay[];
  topItems: Array<{ label: string; qty: number }>;
  slippingRegulars: GuestRow[];
  birthdaysUpcoming: Array<{ name: string; customerId: string; membershipId: string; when: string; inDays: number }>;
  newGuests: GuestRow[];
}

/** One call gives every insight block the dashboard shows. */
export function ownerInsights(input: {
  restaurantId: string;
  session: { role: string; restaurantId?: string | undefined };
}): ApiResult<Insights> {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const now = Date.parse(new Date(state.now).toISOString());
  if (Number.isNaN(now)) return failure("INVALID", "The clock is not set.");

  const memberships = state.memberships.filter((m) => m.restaurantId === input.restaurantId);
  const membershipsById = new Map(memberships.map((m) => [m.id, m]));
  const nameOf = (membershipId: string) => {
    const membership = membershipsById.get(membershipId);
    const customer = membership
      ? state.customers.find((item) => item.id === membership.customerId)
      : undefined;
    return (customer?.name || "").split(" ")[0] || "Guest";
  };

  // Visit days and hours from every valid stamp in this restaurant.
  const weekdayCount = new Array<number>(7).fill(0);
  const bucketCount = new Map<TimeOfDay, number>();
  for (const stamp of state.stamps) {
    if (stamp.restaurantId !== input.restaurantId || stamp.status !== "valid") continue;
    const ms = Date.parse(stamp.createdAt);
    if (!Number.isFinite(ms) || ms > now) continue;
    const weekdayIndex = timeOfDayWeekdayIndex(ms);
    if (weekdayIndex !== null) {
      weekdayCount[weekdayIndex] = (weekdayCount[weekdayIndex] ?? 0) + 1;
    }
    const bucket = timeOfDayFor(ms);
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1);
  }
  const dayBlocks: BlockDay[] = weekdayCount
    .map((visits, weekday) => ({ weekday, label: dayName(weekday).replace(/s$/, ""), visits }))
    .filter((block) => block.visits > 0)
    .sort((a, b) => b.visits - a.visits);
  const busiestDays = dayBlocks.slice(0, 2);
  const quietDays = [...dayBlocks].reverse().slice(0, 2);
  const busiestTimes = [...bucketCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([bucket, visits]) => ({ bucket, label: TIME_OF_DAY_LABEL[bucket], visits }));

  const orderCounts = new Map<string, number>();
  for (const order of state.orders) {
    if (order.restaurantId !== input.restaurantId) continue;
    for (const line of order.items) {
      orderCounts.set(line.label, (orderCounts.get(line.label) ?? 0) + line.qty);
    }
  }
  const topItems = [...orderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, qty]) => ({ label, qty }));

  // Regulars who have gone quiet, from their own rhythm.
  const slippingRegulars: GuestRow[] = [];
  for (const membership of memberships) {
    const stamps = state.stamps.filter(
      (s) => s.membershipId === membership.id && s.status === "valid",
    );
    const pattern = visitPattern(stamps, new Date(now).toISOString());
    if (!pattern.slipping || pattern.visits < 3) continue;
    slippingRegulars.push({
      name: nameOf(membership.id),
      customerId: membership.customerId,
      membershipId: membership.id,
      detail: `${pattern.lastVisitDaysAgo} days since the last visit, usually about ${pattern.averageGapDays} days apart`,
    });
  }
  slippingRegulars.sort((a, b) => Number(b.detail.match(/^\d+/)![0]) - Number(a.detail.match(/^\d+/)![0]));
  slippingRegulars.splice(8);

  const birthdayRows: Insights["birthdaysUpcoming"] = [];
  for (const membership of memberships) {
    const customer = state.customers.find((item) => item.id === membership.customerId);
    const birthday = birthdayOf(customer);
    if (!birthday) continue;
    const inDays = daysUntilBirthday(birthday.month, birthday.day, now);
    if (inDays === null) continue;
    birthdayRows.push({
      name: nameOf(membership.id),
      customerId: membership.customerId,
      membershipId: membership.id,
      when: birthdayLabel(birthday),
      inDays,
    });
  }
  birthdayRows.sort((a, b) => a.inDays - b.inDays);

  const newGuests: GuestRow[] = memberships
    .filter((m) => now - Date.parse(m.joinedAt) <= WEEK && now >= Date.parse(m.joinedAt))
    .map((membership) => ({
      name: nameOf(membership.id),
      customerId: membership.customerId,
      membershipId: membership.id,
      detail: `joined ${new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(membership.joinedAt))}`,
    }));

  return success({
    busiestDays,
    busiestTimes,
    quietDays,
    topItems,
    slippingRegulars,
    birthdaysUpcoming: birthdayRows.slice(0, 8),
    newGuests,
  });
}

function timeOfDayWeekdayIndex(ms: number): number | null {
  const name = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
  }).format(ms);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  return index >= 0 ? index : null;
}

/** Days until the next birthday, or null when it is more than 35 days away. */
export function daysUntilBirthday(month: number, day: number, now: number): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, currentMonth, currentDay] = parts.split("-");
  const nowNoon = Date.UTC(Number(year), Number(currentMonth) - 1, Number(currentDay), 12);
  const target = Date.UTC(Number(year), month - 1, day, 12);
  if (target < nowNoon) return null;
  const diff = (target - nowNoon) / DAY;
  if (diff > 35) return null;
  return Math.round(diff);
}
