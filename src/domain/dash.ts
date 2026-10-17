import { demoRepo } from "@/data/repo";
import { failure, success } from "./demo";
import { requireScope } from "./audit";

export interface OverviewStat {
  key: string;
  label: string;
  value: number;
  tooltip: string;
}

export interface Overview {
  stats: OverviewStat[];
  weeklyVisits: number[];
  lastCampaign: { name: string; delivered: number; failed: number } | null;
}

const DAY = 86400000;
const WEEK = 7 * DAY;

export function overview(
  restaurantId: string,
  session: { role: string; restaurantId?: string | undefined },
  now = demoRepo.read().now,
) {
  const scoped = requireScope(session.role, session.restaurantId, restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  if (!state.restaurants.some((r) => r.id === restaurantId)) {
    return failure("NOT_FOUND", "Restaurant not found.");
  }
  const memberships = state.memberships.filter((m) => m.restaurantId === restaurantId);
  const stamps = state.stamps.filter(
    (s) => s.restaurantId === restaurantId && s.status === "valid",
  );
  const rewards = state.rewards.filter((r) => r.restaurantId === restaurantId);
  const inWeek = (iso: string | null, weeksAgo: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t > now - (weeksAgo + 1) * WEEK && t <= now - weeksAgo * WEEK;
  };
  const newThisWeek = memberships.filter((m) => inWeek(m.joinedAt, 0)).length;
  const visitsThisWeek = stamps.filter((s) => inWeek(s.createdAt, 0)).length;
  const visitsLastWeek = stamps.filter((s) => inWeek(s.createdAt, 1)).length;
  const earned = rewards.length;
  const redeemed = rewards.filter((r) => r.redeemedAt).length;
  const lapsed = memberships.filter(
    (m) => m.lastVisitAt && now - new Date(m.lastVisitAt).getTime() >= 30 * DAY,
  ).length;
  const smsReachable = memberships.filter((m) => m.marketingSms).length;
  const restaurant = state.restaurants.find((r) => r.id === restaurantId)!;
  const weeklyVisits = Array.from(
    { length: 8 },
    (_, weeksAgo) => stamps.filter((s) => inWeek(s.createdAt, weeksAgo)).length,
  ).reverse();
  const campaigns = state.campaigns
    .filter((c) => c.restaurantId === restaurantId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const last = campaigns[0];
  const stats: OverviewStat[] = [
    {
      key: "members",
      label: "Members",
      value: memberships.length,
      tooltip: "Everyone who joined this restaurant.",
    },
    {
      key: "new",
      label: "New this week",
      value: newThisWeek,
      tooltip: "Joined in the last 7 days.",
    },
    {
      key: "visits",
      label: "Visits this week",
      value: visitsThisWeek,
      tooltip: "Valid stamps in the last 7 days.",
    },
    {
      key: "visitsLast",
      label: "Visits last week",
      value: visitsLastWeek,
      tooltip: "Valid stamps 8 to 14 days ago.",
    },
    {
      key: "earned",
      label: "Rewards earned",
      value: earned,
      tooltip: "Rewards created at the stamp threshold.",
    },
    {
      key: "redeemed",
      label: "Rewards redeemed",
      value: redeemed,
      tooltip: "Rewards shown at the till and redeemed.",
    },
    {
      key: "lapsed",
      label: "Lapsed guests",
      value: lapsed,
      tooltip: "No visit in 30 days or more.",
    },
    {
      key: "sms",
      label: "SMS reachable",
      value: smsReachable,
      tooltip: "Members with marketing SMS on.",
    },
    {
      key: "push",
      label: "Push reachable",
      value: 0,
      tooltip: "Push arrives in M8; zero until then.",
    },
    {
      key: "credit",
      label: "Credit (cents)",
      value: restaurant.creditCents,
      tooltip: "Prepaid SMS credit balance.",
    },
  ];
  const result: Overview = {
    stats,
    weeklyVisits,
    lastCampaign: last ? { name: last.name, delivered: last.delivered, failed: last.failed } : null,
  };
  return success(result);
}
