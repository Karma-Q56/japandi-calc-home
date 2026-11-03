import type { Overview, OverviewCampaign, OverviewStat } from "@/domain/dash";

export type LiveStamp = {
  membershipId: string;
  createdAt: string;
};

export type LiveCampaign = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  delivered: number;
  failed: number;
};

export type LiveOverviewInput = {
  creditCents: number;
  memberships: string[];
  stamps: LiveStamp[];
  rewardsReady: number;
  campaigns: LiveCampaign[];
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  pending_approval: "Waiting for approval",
};

const DAY = 86400000;
const WEEK = 7 * DAY;
const SAST = 2 * 3600000;

const johannesburgMoment = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));

/**
 * Build the owner overview from live Postgres rows. Kept pure so the numbers
 * can be tested without a database; the query only supplies rows.
 */
export function buildLiveOverview(input: LiveOverviewInput, now = Date.now()): Overview {
  const inWeek = (iso: string, weeksAgo: number) => {
    const time = new Date(iso).getTime();
    return time > now - (weeksAgo + 1) * WEEK && time <= now - weeksAgo * WEEK;
  };
  const dayStart = Math.floor((now + SAST) / DAY) * DAY - SAST;
  const todayStamps = input.stamps.filter(
    (stamp) => new Date(stamp.createdAt).getTime() >= dayStart,
  ).length;

  const visitsByMembership = new Map<string, number>();
  for (const stamp of input.stamps) {
    visitsByMembership.set(
      stamp.membershipId,
      (visitsByMembership.get(stamp.membershipId) ?? 0) + 1,
    );
  }
  const returning = input.memberships.filter(
    (membershipId) => (visitsByMembership.get(membershipId) ?? 0) >= 2,
  ).length;

  const weeklyVisits = Array.from({ length: 8 }, (_, weeksAgo) =>
    input.stamps.filter((stamp) => inWeek(stamp.createdAt, weeksAgo)).length,
  ).reverse();

  const campaigns = [...input.campaigns].sort((a, b) => {
    const aTime = a.sentAt ?? a.createdAt;
    const bTime = b.sentAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
  const last = campaigns.find((campaign) => campaign.sentAt);
  const upcoming = campaigns
    .filter((campaign) => ["draft", "scheduled", "pending_approval"].includes(campaign.status))
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt))[0];

  const nextCampaign: OverviewCampaign | null = upcoming
    ? {
        id: upcoming.id,
        name: upcoming.name,
        status: upcoming.status,
        statusLabel:
          CAMPAIGN_STATUS_LABELS[upcoming.status] ?? upcoming.status.replace("_", " "),
        when: upcoming.scheduledAt ? johannesburgMoment(upcoming.scheduledAt) : null,
        href: `/app/campaigns/${upcoming.id}`,
      }
    : null;

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
      value: input.rewardsReady,
      tooltip: "Earned rewards not yet redeemed at the till.",
      href: "/app/customers",
      action: "Redeem at till",
    },
    {
      key: "credit",
      label: "SMS credit",
      value: input.creditCents,
      display: `R${(input.creditCents / 100).toFixed(2)}`,
      tooltip: "Prepaid SMS credit balance. Top up before your next campaign.",
      href: "/app/credit",
      action: "Top up",
    },
    {
      key: "campaign",
      label: "Campaigns sent",
      value: campaigns.filter((campaign) => campaign.sentAt).length,
      tooltip:
        "Campaigns already sent to your guests. Drafts and scheduled sends are not counted.",
      href: "/app/campaigns",
      action: "See campaigns",
    },
  ];

  return {
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
}
