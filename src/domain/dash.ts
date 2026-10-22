import { demoRepo } from "@/data/repo";
import { failure, success } from "./demo";
import { requireScope } from "./audit";

export interface OverviewStat {
  key: string;
  label: string;
  value: number;
  /** Optional display text, e.g. a currency amount. */
  display?: string;
  tooltip: string;
  /** Where the owner goes to act on this number. */
  href: string;
  action: string;
}

export interface OverviewCampaign {
  id: string;
  name: string;
  status: string;
  /** Human status, e.g. "Draft", "Scheduled", "Waiting for approval". */
  statusLabel: string;
  /** Johannesburg send date and time, or null when it has not been scheduled. */
  when: string | null;
  href: string;
}

export interface OverviewLastCampaign {
  id: string;
  name: string;
  delivered: number;
  failed: number;
  sentAt: string | null;
  /** Johannesburg date of the send, or null when there is no send date. */
  sentLabel: string | null;
}

export interface Overview {
  stats: OverviewStat[];
  weeklyVisits: number[];
  lastCampaign: OverviewLastCampaign | null;
  nextCampaign: OverviewCampaign | null;
}

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  pending_approval: "Waiting for approval",
};

const johannesburgMoment = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));

const DAY = 86400000;
const WEEK = 7 * DAY;
const SAST = 2 * 3600000;

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
  const restaurant = state.restaurants.find((r) => r.id === restaurantId)!;

  const inWeek = (iso: string | null, weeksAgo: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t > now - (weeksAgo + 1) * WEEK && t <= now - weeksAgo * WEEK;
  };
  const dayStart = Math.floor((now + SAST) / DAY) * DAY - SAST;
  const todayStamps = stamps.filter(
    (stamp) => new Date(stamp.createdAt).getTime() >= dayStart,
  ).length;

  const visitsByMembership = new Map<string, number>();
  for (const stamp of stamps) {
    visitsByMembership.set(
      stamp.membershipId,
      (visitsByMembership.get(stamp.membershipId) ?? 0) + 1,
    );
  }
  const returning = memberships.filter(
    (membership) => (visitsByMembership.get(membership.id) ?? 0) >= 2,
  ).length;
  const rewardsReady = rewards.filter((reward) => !reward.redeemedAt).length;

  const weeklyVisits = Array.from({ length: 8 }, (_, weeksAgo) =>
    stamps.filter((s) => inWeek(s.createdAt, weeksAgo)).length,
  ).reverse();
  const campaigns = state.campaigns
    .filter((c) => c.restaurantId === restaurantId)
    .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt));
  const last = campaigns.find((campaign) => campaign.sentAt);
  const upcoming = campaigns
    .filter((campaign) => ["draft", "scheduled", "pending_approval"].includes(campaign.status))
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt))[0];
  const nextCampaign: OverviewCampaign | null = upcoming
    ? {
        id: upcoming.id,
        name: upcoming.name,
        status: upcoming.status,
        statusLabel: CAMPAIGN_STATUS_LABELS[upcoming.status] ?? upcoming.status.replace("_", " "),
        when: upcoming.scheduledAt ? johannesburgMoment(upcoming.scheduledAt) : null,
        href: `/app/campaigns/${upcoming.id}`,
      }
    : null;
  const sentCount = campaigns.filter((campaign) => campaign.sentAt).length;

  const stats: OverviewStat[] = [
    {
      key: "today",
      label: "Stamps today",
      value: todayStamps,
      tooltip: "Valid stamps recorded since midnight.",
      href: "/stamp",
      action: "Open till",
    },
    {
      key: "returning",
      label: "Returning guests",
      value: returning,
      tooltip: "Guests with at least two recorded visits.",
      href: "/app/customers",
      action: "See guests",
    },
    {
      key: "ready",
      label: "Rewards ready",
      value: rewardsReady,
      tooltip: "Earned rewards not yet redeemed at the till.",
      href: "/app/customers",
      action: "Redeem at till",
    },
    {
      key: "credit",
      label: "SMS credit",
      value: restaurant.creditCents,
      display: `R${(restaurant.creditCents / 100).toFixed(2)}`,
      tooltip: "Prepaid SMS credit balance. Top up before your next campaign.",
      href: "/app/credit",
      action: "Top up",
    },
    {
      key: "campaign",
      label: "Campaigns sent",
      value: sentCount,
      tooltip: "Campaigns already sent to your guests. Drafts and scheduled sends are not counted.",
      href: "/app/campaigns",
      action: "See campaigns",
    },
  ];
  const result: Overview = {
    stats,
    weeklyVisits,
    lastCampaign: last
      ? {
          id: last.id,
          name: last.name,
          delivered: last.delivered,
          failed: last.failed,
          sentAt: last.sentAt,
          sentLabel: last.sentAt ? johannesburgMoment(last.sentAt) : null,
        }
      : null,
    nextCampaign,
  };
  return success(result);
}
