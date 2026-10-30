/**
 * Owner reports. Every number comes from the demo store, and every estimate
 * says which basis it used so an owner can tell facts from guesses.
 */
import { demoRepo } from "@/data/repo";
import type { Restaurant } from "@/data/types";
import { johannesburgTime } from "@/lib/johannesburg-time";
import { failure, success, type ApiResult } from "./demo";
import { requireScope } from "./audit";

const DAY = 86400000;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type ReportRange = 7 | 14 | 30 | 90;

/** Illustrative plan fees, clearly labelled as such on the page. */
const PLAN_FEES: Record<Restaurant["plan"], { fee: number; label: string }> = {
  starter: { fee: 39900, label: "Starter (R399 a month)" },
  managed: { fee: 120000, label: "Growth (R1200 a month)" },
  partner: { fee: 300000, label: "Pro (R3000 a month)" },
  custom: { fee: 0, label: "Custom plan" },
};

export interface ReportSeriesPoint {
  key: string;
  label: string;
  visits: number;
  previous: number;
}

export interface ReportDayRow {
  weekday: number;
  label: string;
  visits: number;
}

export interface ReportHourRow {
  hour: number;
  label: string;
  visits: number;
}

export interface ReportCampaignRow {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  visited: number;
}

export interface ReportOfferRow {
  label: string;
  count: number;
}

export interface ReportGuestRow {
  name: string;
  visits: number;
  spendCents: number | null;
}

export interface ReportItemRow {
  label: string;
  qty: number;
}

export interface ReportWorth {
  additionalVisits: number;
  averageSpendCents: number;
  valueCents: number;
  planFeeCents: number;
  planLabel: string;
  smsCostCents: number;
  netCents: number;
}

export interface Reports {
  rangeDays: ReportRange;
  from: string;
  to: string;
  visits: number;
  previousVisits: number;
  uniqueGuests: number;
  previousUniqueGuests: number;
  newMembers: number;
  previousNewMembers: number;
  returningGuests: number;
  returnRate: number;
  previousReturnRate: number;
  estimatedSalesCents: number;
  previousEstimatedSalesCents: number;
  billedVisits: number;
  averageItemCents: number;
  salesBasis: "bills" | "mixed" | "menu";
  discountCents: number;
  discountCount: number;
  series: ReportSeriesPoint[];
  busiestHours: ReportHourRow[];
  busiestDays: ReportDayRow[];
  campaigns: ReportCampaignRow[];
  topOffers: ReportOfferRow[];
  topGuests: ReportGuestRow[];
  topItems: ReportItemRow[];
  worth: ReportWorth;
  notes: string[];
}

/** Johannesburg calendar day, as YYYY-MM-DD. */
function dayKey(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
}

function averageMenuPrice(restaurantId: string, now: number): number {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const itemIds = new Set(restaurant?.menuSectionIds ?? []);
  const prices = state.items
    .filter(
      (item) =>
        item.restaurantId === restaurantId &&
        item.available &&
        item.priceCents > 0 &&
        (itemIds.size === 0 || itemIds.has(item.sectionId)),
    )
    .map((item) => item.priceCents);
  if (prices.length === 0) return 0;
  return Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
}

export function ownerReport(input: {
  restaurantId: string;
  days: ReportRange;
  session: { role: string; restaurantId?: string | undefined };
}): ApiResult<Reports> {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  const now = state.now;
  const days = input.days;
  const start = now - days * DAY;
  const previousStart = now - 2 * days * DAY;
  const inRange = (ms: number) => ms >= start && ms <= now;
  const inPrevious = (ms: number) => ms >= previousStart && ms < start;

  const stamps = state.stamps.filter(
    (stamp) =>
      stamp.restaurantId === restaurant.id &&
      stamp.status === "valid" &&
      Number.isFinite(Date.parse(stamp.createdAt)) &&
      Date.parse(stamp.createdAt) <= now,
  );
  const stampsInRange = stamps.filter((stamp) => inRange(Date.parse(stamp.createdAt)));
  const stampsInPrevious = stamps.filter((stamp) => inPrevious(Date.parse(stamp.createdAt)));

  const unique = (list: typeof stamps) =>
    new Set(list.map((stamp) => stamp.membershipId)).size;
  const returning = (list: typeof stamps) => {
    const counts = new Map<string, number>();
    for (const stamp of list) {
      counts.set(stamp.membershipId, (counts.get(stamp.membershipId) ?? 0) + 1);
    }
    return [...counts.values()].filter((count) => count >= 2).length;
  };

  const memberships = state.memberships.filter(
    (item) => item.restaurantId === restaurant.id,
  );
  const membersJoined = (predicate: (ms: number) => boolean) =>
    memberships.filter((item) => predicate(Date.parse(item.joinedAt))).length;

  const averageItemCents = averageMenuPrice(restaurant.id, now);
  const orders = state.orders.filter(
    (order) =>
      order.restaurantId === restaurant.id &&
      Number.isFinite(Date.parse(order.createdAt)) &&
      inRange(Date.parse(order.createdAt)),
  );
  const billCents = orders.reduce(
    (sum, order) => sum + (typeof order.billCents === "number" && order.billCents > 0 ? order.billCents : 0),
    0,
  );
  const billedStampIds = new Set(
    orders
      .filter((order) => typeof order.billCents === "number" && order.billCents > 0 && order.stampId)
      .map((order) => order.stampId),
  );
  const billedVisits = Math.min(stampsInRange.length, billedStampIds.size);
  const unbilledVisits = Math.max(0, stampsInRange.length - billedVisits);
  const estimatedSalesCents = billCents + unbilledVisits * averageItemCents;
  const salesBasis: Reports["salesBasis"] =
    billedVisits === 0 ? "menu" : unbilledVisits === 0 ? "bills" : "mixed";
  const averageSpendCents =
    stampsInRange.length > 0 ? Math.round(estimatedSalesCents / stampsInRange.length) : 0;

  const previousOrders = state.orders.filter(
    (order) =>
      order.restaurantId === restaurant.id &&
      inPrevious(Date.parse(order.createdAt)),
  );
  const previousBillCents = previousOrders.reduce(
    (sum, order) => sum + (typeof order.billCents === "number" && order.billCents > 0 ? order.billCents : 0),
    0,
  );
  const previousBilledStamps = new Set(
    previousOrders
      .filter((order) => typeof order.billCents === "number" && order.billCents > 0 && order.stampId)
      .map((order) => order.stampId),
  );
  const previousVisitsWithoutBill = Math.max(
    0,
    stampsInPrevious.length - Math.min(stampsInPrevious.length, previousBilledStamps.size),
  );
  const previousEstimatedSalesCents =
    previousBillCents + previousVisitsWithoutBill * averageItemCents;

  const redemptions = state.redemptions.filter(
    (redemption) =>
      redemption.restaurantId === restaurant.id &&
      inRange(Date.parse(redemption.redeemedAt)),
  );
  const discountCount = redemptions.length;
  const discountCents = discountCount * averageItemCents;

  // Daily series, with the same index from the previous period beside it.
  const series: ReportSeriesPoint[] = Array.from({ length: days }, (_, index) => {
    const currentMs = start + index * DAY;
    const previousMs = previousStart + index * DAY;
    const currentKey = dayKey(currentMs);
    const previousKey = dayKey(previousMs);
    return {
      key: currentKey,
      label: dayLabel(currentMs),
      visits: stampsInRange.filter((stamp) => dayKey(Date.parse(stamp.createdAt)) === currentKey)
        .length,
      previous: stampsInPrevious.filter(
        (stamp) => dayKey(Date.parse(stamp.createdAt)) === previousKey,
      ).length,
    };
  });

  const dayCounts = new Array<number>(7).fill(0);
  const hourCounts = new Array<number>(24).fill(0);
  for (const stamp of stampsInRange) {
    const local = johannesburgTime(Date.parse(stamp.createdAt));
    const weekday = WEEKDAY_NAMES.indexOf(local.weekday);
    if (weekday >= 0) dayCounts[weekday] = (dayCounts[weekday] ?? 0) + 1;
    hourCounts[local.hour] = (hourCounts[local.hour] ?? 0) + 1;
  }
  const busiestDays = dayCounts
    .map((visits, weekday) => ({ weekday, label: WEEKDAY_NAMES[weekday]!, visits }))
    .sort((a, b) => b.visits - a.visits);
  const busiestHours = hourCounts.map((visits, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    visits,
  }));

  // Campaign performance: messages, delivery and visits within seven days.
  const campaignsInRange = state.campaigns.filter(
    (campaign) =>
      campaign.restaurantId === restaurant.id &&
      campaign.sentAt !== null &&
      inRange(Date.parse(campaign.sentAt)),
  );
  const attributedStampIds = new Set<string>();
  const campaigns: ReportCampaignRow[] = campaignsInRange.map((campaign) => {
    const sentAt = Date.parse(campaign.sentAt!);
    const messages = state.messages.filter((message) => message.campaignId === campaign.id);
    const delivered = messages.filter((message) => message.status === "delivered").length;
    const sent =
      messages.filter(
        (message) => message.status === "sent" || message.status === "delivered",
      ).length || campaign.recipients;
    const recipientIds = new Set(
      messages
        .map((message) => message.membershipId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const stamp of stamps) {
      const at = Date.parse(stamp.createdAt);
      if (
        recipientIds.has(stamp.membershipId) &&
        at >= sentAt &&
        at <= sentAt + 7 * DAY
      ) {
        attributedStampIds.add(stamp.id);
      }
    }
    const visited = new Set(
      stamps
        .filter(
          (stamp) =>
            recipientIds.has(stamp.membershipId) &&
            Date.parse(stamp.createdAt) >= sentAt &&
            Date.parse(stamp.createdAt) <= sentAt + 7 * DAY,
        )
        .map((stamp) => stamp.membershipId),
    ).size;
    return { id: campaign.id, name: campaign.name, sent, delivered, visited };
  });

  // Offers redeemed in the range, grouped by the thing that was redeemed.
  const offerCounts = new Map<string, number>();
  for (const redemption of redemptions) {
    const label =
      redemption.kind === "reward"
        ? state.rewards.find((reward) => reward.id === redemption.rewardId)?.description
        : redemption.kind === "campaign"
          ? state.campaigns.find((campaign) => campaign.id === redemption.rewardId)?.name
          : state.specials.find((special) => special.id === redemption.specialId)?.title;
    const name = label?.trim() || (redemption.kind === "reward" ? "Reward" : "Offer");
    offerCounts.set(name, (offerCounts.get(name) ?? 0) + 1);
  }
  const topOffers = [...offerCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const names = new Map(
    state.customers.map((customer) => [customer.id, customer.name || "Removed guest"]),
  );
  const guestVisits = new Map<string, number>();
  for (const stamp of stampsInRange) {
    guestVisits.set(stamp.membershipId, (guestVisits.get(stamp.membershipId) ?? 0) + 1);
  }
  const spendByMembership = new Map<string, number>();
  for (const order of orders) {
    if (typeof order.billCents === "number" && order.billCents > 0) {
      spendByMembership.set(
        order.membershipId,
        (spendByMembership.get(order.membershipId) ?? 0) + order.billCents,
      );
    }
  }
  const topGuests: ReportGuestRow[] = [...guestVisits.entries()]
    .map(([membershipId, visits]) => {
      const membership = state.memberships.find((item) => item.id === membershipId);
      return {
        name: membership ? (names.get(membership.customerId) ?? "Guest") : "Guest",
        visits,
        spendCents: restaurant.trackOrders
          ? (spendByMembership.get(membershipId) ?? 0)
          : null,
      };
    })
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5);

  const itemCounts = new Map<string, number>();
  if (restaurant.trackOrders) {
    for (const order of orders) {
      for (const line of order.items) {
        itemCounts.set(line.label, (itemCounts.get(line.label) ?? 0) + line.qty);
      }
    }
  }
  const topItems = [...itemCounts.entries()]
    .map(([label, qty]) => ({ label, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const smsCostCents = state.messages
    .filter(
      (message) =>
        message.restaurantId === restaurant.id &&
        Number.isFinite(Date.parse(message.createdAt)) &&
        inRange(Date.parse(message.createdAt)),
    )
    .reduce((sum, message) => sum + message.costCents, 0);

  const additionalVisits = attributedStampIds.size + discountCount;
  const plan = PLAN_FEES[restaurant.plan];
  const valueCents = additionalVisits * averageSpendCents;

  const notes = [
    salesBasis === "bills"
      ? "Estimated sales use the real bill amounts recorded at the till for every visit in this range."
      : salesBasis === "menu"
        ? `No till bills were recorded in this range, so estimated sales use your average menu price of ${averageItemCents > 0 ? `R${(averageItemCents / 100).toFixed(2)}` : "R0"}.`
        : `Estimated sales use real till bills for ${billedVisits} visit${billedVisits === 1 ? "" : "s"} and your average menu price of ${averageItemCents > 0 ? `R${(averageItemCents / 100).toFixed(2)}` : "R0"} for the rest.`,
    `Discount given estimates ${discountCount} redeemed reward${discountCount === 1 ? "" : "s"} or offer${discountCount === 1 ? "" : "s"} at your average menu price. It is not an accounting figure.`,
    "Is Patron worth it? compares an estimate of extra visits from campaigns and redemptions with the illustrative plan fee and this range's message cost. It is a guide, not a guaranteed return.",
  ];

  return success({
    rangeDays: days,
    from: new Date(start).toISOString(),
    to: new Date(now).toISOString(),
    visits: stampsInRange.length,
    previousVisits: stampsInPrevious.length,
    uniqueGuests: unique(stampsInRange),
    previousUniqueGuests: unique(stampsInPrevious),
    newMembers: membersJoined(inRange),
    previousNewMembers: membersJoined(inPrevious),
    returningGuests: returning(stampsInRange),
    returnRate:
      stampsInRange.length === 0
        ? 0
        : Math.round((returning(stampsInRange) / unique(stampsInRange)) * 100),
    previousReturnRate:
      stampsInPrevious.length === 0
        ? 0
        : Math.round((returning(stampsInPrevious) / unique(stampsInPrevious)) * 100),
    estimatedSalesCents,
    previousEstimatedSalesCents,
    billedVisits,
    averageItemCents,
    salesBasis,
    discountCents,
    discountCount,
    series,
    busiestHours,
    busiestDays,
    campaigns,
    topOffers,
    topGuests,
    topItems,
    worth: {
      additionalVisits,
      averageSpendCents,
      valueCents,
      planFeeCents: plan.fee,
      planLabel: plan.label,
      smsCostCents,
      netCents: valueCents - plan.fee - smsCostCents,
    },
    notes,
  });
}

/** A small, spreadsheet-friendly export. One row per day, then summary rows. */
export function reportCsv(report: Reports, restaurantName: string): string {
  const esc = (value: string | number | undefined) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows: (string | number)[][] = [
    ["Restaurant", restaurantName],
    ["Range", `${report.rangeDays} days`],
    ["From", report.from.slice(0, 10)],
    ["To", report.to.slice(0, 10)],
    [],
    ["Date", "Visits", "Previous period visits"],
    ...report.series.map((point) => [point.key, point.visits, point.previous]),
    [],
    ["Visits", report.visits],
    ["Previous visits", report.previousVisits],
    ["Unique guests", report.uniqueGuests],
    ["New members", report.newMembers],
    ["Return rate percent", report.returnRate],
    ["Estimated sales rand", (report.estimatedSalesCents / 100).toFixed(2)],
    ["Sales basis", report.salesBasis],
    ["Discount given rand", (report.discountCents / 100).toFixed(2)],
    ["Campaign hits", report.campaigns.reduce((sum, row) => sum + row.visited, 0)],
    ["Estimated extra visits", report.worth.additionalVisits],
    ["Estimated value rand", (report.worth.valueCents / 100).toFixed(2)],
    ["Plan fee rand", (report.worth.planFeeCents / 100).toFixed(2)],
    ["Message cost rand", (report.worth.smsCostCents / 100).toFixed(2)],
    ["Net estimate rand", (report.worth.netCents / 100).toFixed(2)],
  ];
  return rows.map((row) => row.map(esc).join(",")).join("\n");
}
