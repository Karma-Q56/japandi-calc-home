import { sql } from "drizzle-orm";
import { withContext } from "./db";
import type { Viewer } from "./auth-viewer";
import { buildLiveOverview, type LiveCampaign, type LiveStamp } from "@/lib/live-overview";

type RestaurantRow = {
  name: string;
  credit_cents: number;
};

type StampRow = {
  membership_id: string;
  created_at: string | Date;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | Date | null;
  sent_at: string | Date | null;
  created_at: string | Date;
  delivered: number;
  failed: number;
};

type CardRow = {
  id: string;
  stamps_current: number;
  stamps_total: number;
  last_visit_at: string | Date | null;
  name: string;
  slug: string;
  stamps_required: number;
  reward_description: string;
  rewards_ready: number;
};

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

const iso = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export type LiveMyCards = {
  name: string;
  cards: {
    membershipId: string;
    restaurantName: string;
    restaurantSlug: string;
    stampsCurrent: number;
    stampsTotal: number;
    stampsRequired: number;
    rewardDescription: string;
    rewardsReady: number;
    lastVisitAt: string | null;
  }[];
};

/** Owner or manager overview, scoped by the signed-in viewer's restaurant. */
export async function loadOwnerOverview(viewer: Viewer) {
  if (
    (viewer.role !== "owner" && viewer.role !== "manager") ||
    !viewer.restaurantId
  ) {
    return null;
  }

  return withContext(
    {
      databaseUrl: databaseUrl(),
      restaurantId: viewer.restaurantId,
      isOperator: false,
    },
    async (transaction) => {
      const restaurant = await transaction.execute<RestaurantRow>(sql`
        select
          r.name,
          coalesce((
            select sum(cl.amount_cents)
            from credit_ledger cl
            where cl.restaurant_id = r.id
          ), 0)::integer as credit_cents
        from restaurant r
        where r.id = ${viewer.restaurantId}
        limit 1
      `);
      const row = restaurant.rows[0];
      if (!row) return null;

      const stamps = await transaction.execute<StampRow>(sql`
        select membership_id, created_at
        from stamp_event
        where restaurant_id = ${viewer.restaurantId}
          and status = 'valid'
          and created_at >= now() - interval '56 days'
      `);
      const memberships = await transaction.execute<{ id: string }>(sql`
        select id from membership where restaurant_id = ${viewer.restaurantId}
      `);
      const rewards = await transaction.execute<{ count: number }>(sql`
        select count(*)::integer as count
        from reward
        where restaurant_id = ${viewer.restaurantId} and status = 'available'
      `);
      const campaigns = await transaction.execute<CampaignRow>(sql`
        select
          c.id,
          c.name,
          c.status::text as status,
          c.scheduled_at,
          c.sent_at,
          c.created_at,
          coalesce(sum(case when m.status in ('sent', 'delivered') then 1 else 0 end), 0)::integer as delivered,
          coalesce(sum(case when m.status = 'failed' then 1 else 0 end), 0)::integer as failed
        from campaign c
        left join message m on m.campaign_id = c.id
        where c.restaurant_id = ${viewer.restaurantId}
        group by c.id
        order by coalesce(c.sent_at, c.created_at) desc
      `);

      const liveStamps: LiveStamp[] = stamps.rows.map((stamp) => ({
        membershipId: stamp.membership_id,
        createdAt: new Date(stamp.created_at).toISOString(),
      }));
      const liveCampaigns: LiveCampaign[] = campaigns.rows.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        scheduledAt: iso(campaign.scheduled_at),
        sentAt: iso(campaign.sent_at),
        createdAt: new Date(campaign.created_at).toISOString(),
        delivered: Number(campaign.delivered),
        failed: Number(campaign.failed),
      }));

      return {
        restaurantName: row.name,
        overview: buildLiveOverview({
          creditCents: Number(row.credit_cents),
          memberships: memberships.rows.map((membership) => membership.id),
          stamps: liveStamps,
          rewardsReady: Number(rewards.rows[0]?.count ?? 0),
          campaigns: liveCampaigns,
        }),
      };
    },
  );
}

/** The signed-in guest's cards, read from their own customer id. */
export async function loadMyCards(viewer: Viewer): Promise<LiveMyCards | null> {
  if (viewer.role !== "guest" || !viewer.customerId) return null;

  const rows = await withContext(
      {
        databaseUrl: databaseUrl(),
        customerId: viewer.customerId,
        isOperator: false,
      },
      async (transaction) => {
        const result = await transaction.execute<CardRow>(sql`
          select
            m.id,
            m.stamps_current,
            m.stamps_total,
            m.last_visit_at,
            r.name,
            r.slug,
            r.stamps_required,
            r.reward_description,
            (
              select count(*)::integer
              from reward rw
              where rw.membership_id = m.id and rw.status = 'available'
            ) as rewards_ready
          from membership m
          join restaurant r on r.id = m.restaurant_id
          where m.customer_id = ${viewer.customerId}
          order by m.last_visit_at desc nulls last, m.joined_at desc
        `);
        return result.rows;
      },
    );

    return {
      name: viewer.name,
      cards: rows.map((card) => ({
        membershipId: card.id,
        restaurantName: card.name,
        restaurantSlug: card.slug,
        stampsCurrent: Number(card.stamps_current),
        stampsTotal: Number(card.stamps_total),
        stampsRequired: Number(card.stamps_required),
        rewardDescription: card.reward_description,
        rewardsReady: Number(card.rewards_ready),
        lastVisitAt: iso(card.last_visit_at),
      })),
    };
}
