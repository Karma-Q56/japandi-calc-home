import { sql } from "drizzle-orm";
import { withContext } from "./db";
import type { Viewer } from "./auth-viewer";
import type { LiveCustomerRow } from "@/lib/live-customers";
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

export type LiveCustomerList = {
  restaurantName: string;
  rows: LiveCustomerRow[];
};

export type LiveCampaignRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  channel: string;
  recipients: number;
  estimatedCostCents: number | null;
  actualCostCents: number;
  sentAt: string | null;
  createdAt: string;
};

export type LiveCampaignList = {
  restaurantName: string;
  campaigns: LiveCampaignRow[];
};

type CustomerListRow = {
  membership_id: string;
  customer_id: string;
  name: string;
  phone_e164: string;
  stamps_current: number;
  stamps_total: number;
  stamps_required: number;
  rewards_waiting: number;
  last_visit_at: string | Date | null;
  joined_at: string | Date;
  marketing_sms: string;
  birthday: string | Date | null;
};

type CampaignListRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  channel: string;
  recipients: number;
  estimated_cost_cents: number | null;
  actual_cost_cents: number;
  sent_at: string | Date | null;
  created_at: string | Date;
};

/** The guest list for the signed-in owner's restaurant. */
export async function loadCustomerList(viewer: Viewer): Promise<LiveCustomerList | null> {
  if ((viewer.role !== "owner" && viewer.role !== "manager") || !viewer.restaurantId) {
    return null;
  }
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurant = await transaction.execute<{ name: string }>(sql`
        select name from restaurant where id = ${viewer.restaurantId} limit 1
      `);
      const result = await transaction.execute<CustomerListRow>(sql`
        select
          m.id as membership_id,
          c.id as customer_id,
          c.name,
          c.phone_e164,
          m.stamps_current,
          m.stamps_total,
          r.stamps_required,
          (
            select count(*)::integer from reward rw
            where rw.membership_id = m.id and rw.status = 'available'
          ) as rewards_waiting,
          m.last_visit_at,
          m.joined_at,
          m.marketing_sms::text as marketing_sms,
          c.birthday
        from membership m
        join customer c on c.id = m.customer_id
        join restaurant r on r.id = m.restaurant_id
        where m.restaurant_id = ${viewer.restaurantId}
        order by m.last_visit_at desc nulls last, m.joined_at desc
        limit 1000
      `);
      return {
        restaurantName: restaurant.rows[0]?.name ?? "Your restaurant",
        rows: result.rows.map((row) => ({
          membershipId: row.membership_id,
          customerId: row.customer_id,
          name: row.name,
          phoneE164: row.phone_e164,
          stampsCurrent: Number(row.stamps_current),
          stampsTotal: Number(row.stamps_total),
          stampsRequired: Number(row.stamps_required),
          rewardsWaiting: Number(row.rewards_waiting),
          lastVisitAt: iso(row.last_visit_at),
          joinedAt: new Date(row.joined_at).toISOString(),
          smsOptedIn: row.marketing_sms === "opted_in",
          birthdayMonth: row.birthday ? new Date(row.birthday).getUTCMonth() : null,
        })),
      };
    },
  );
}

/** The campaign list for the signed-in owner's restaurant. */
export async function loadCampaignList(viewer: Viewer): Promise<LiveCampaignList | null> {
  if ((viewer.role !== "owner" && viewer.role !== "manager") || !viewer.restaurantId) {
    return null;
  }
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurant = await transaction.execute<{ name: string }>(sql`
        select name from restaurant where id = ${viewer.restaurantId} limit 1
      `);
      const result = await transaction.execute<CampaignListRow>(sql`
        select
          c.id,
          c.name,
          c.code,
          c.status::text as status,
          c.channel::text as channel,
          coalesce(c.est_recipients, count(m.id), 0)::integer as recipients,
          c.est_cost_cents,
          c.actual_cost_cents,
          c.sent_at,
          c.created_at
        from campaign c
        left join message m on m.campaign_id = c.id
        where c.restaurant_id = ${viewer.restaurantId}
        group by c.id
        order by c.created_at desc
      `);
      return {
        restaurantName: restaurant.rows[0]?.name ?? "Your restaurant",
        campaigns: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          status: row.status,
          channel: row.channel,
          recipients: Number(row.recipients),
          estimatedCostCents: row.estimated_cost_cents === null ? null : Number(row.estimated_cost_cents),
          actualCostCents: Number(row.actual_cost_cents),
          sentAt: iso(row.sent_at),
          createdAt: new Date(row.created_at).toISOString(),
        })),
      };
    },
  );
}

export type LiveCustomerProfile = {
  restaurantName: string;
  customerId: string;
  membershipId: string;
  name: string;
  phoneE164: string;
  stampsCurrent: number;
  stampsTotal: number;
  stampsRequired: number;
  rewardsWaiting: number;
  lastVisitAt: string | null;
  joinedAt: string;
  smsOptedIn: boolean;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  stamps: { id: string; createdAt: string; status: string }[];
  rewards: { id: string; description: string; status: string; earnedAt: string }[];
  consents: { id: string; purpose: string; action: string; createdAt: string }[];
};

export type LiveCampaignResults = {
  restaurantName: string;
  campaign: {
    id: string;
    name: string;
    code: string;
    body: string;
    channel: string;
    status: string;
    recipients: number;
    estimatedCostCents: number | null;
    actualCostCents: number;
    sentAt: string | null;
    scheduledAt: string | null;
    createdAt: string;
    requiresApproval: boolean;
    approved: boolean;
  };
  messages: {
    id: string;
    name: string;
    phoneE164: string;
    status: string;
    segments: number;
    costCents: number;
    sentAt: string | null;
    deliveredAt: string | null;
  }[];
};

type ProfileRow = {
  restaurant_name: string;
  customer_id: string;
  membership_id: string;
  name: string;
  phone_e164: string;
  stamps_current: number;
  stamps_total: number;
  stamps_required: number;
  rewards_waiting: number;
  last_visit_at: string | Date | null;
  joined_at: string | Date;
  marketing_sms: string;
  birthday: string | Date | null;
};

type CampaignHeadRow = {
  restaurant_name: string;
  id: string;
  name: string;
  code: string;
  message_body: string;
  channel: string;
  status: string;
  recipients: number;
  est_cost_cents: number | null;
  actual_cost_cents: number;
  sent_at: string | Date | null;
  scheduled_at: string | Date | null;
  created_at: string | Date;
  requires_approval: boolean;
  approved_by: string | null;
};

type CampaignMessageRow = {
  id: string;
  name: string;
  phone_e164: string;
  status: string;
  segments: number;
  cost_cents: number;
  sent_at: string | Date | null;
  delivered_at: string | Date | null;
};

/** One guest's live profile, scoped to the owner's restaurant. */
export async function loadCustomerProfile(
  viewer: Viewer,
  customerId: string,
): Promise<LiveCustomerProfile | null> {
  if ((viewer.role !== "owner" && viewer.role !== "manager") || !viewer.restaurantId) {
    return null;
  }
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<ProfileRow>(sql`
        select
          r.name as restaurant_name,
          c.id as customer_id,
          m.id as membership_id,
          c.name,
          c.phone_e164,
          m.stamps_current,
          m.stamps_total,
          r.stamps_required,
          (
            select count(*)::integer from reward rw
            where rw.membership_id = m.id and rw.status = 'available'
          ) as rewards_waiting,
          m.last_visit_at,
          m.joined_at,
          m.marketing_sms::text as marketing_sms,
          c.birthday
        from membership m
        join customer c on c.id = m.customer_id
        join restaurant r on r.id = m.restaurant_id
        where m.restaurant_id = ${viewer.restaurantId}
          and c.id = ${customerId}
        limit 1
      `);
      const row = result.rows[0];
      if (!row) return null;

      const stamps = await transaction.execute<{
        id: string;
        created_at: string | Date;
        status: string;
      }>(sql`
        select id, created_at, status::text as status
        from stamp_event
        where membership_id = ${row.membership_id}
        order by created_at desc
        limit 20
      `);
      const rewards = await transaction.execute<{
        id: string;
        description: string;
        status: string;
        earned_at: string | Date;
      }>(sql`
        select id, description, status::text as status, earned_at
        from reward
        where membership_id = ${row.membership_id}
        order by earned_at desc
        limit 20
      `);
      const consents = await transaction.execute<{
        id: string;
        purpose: string;
        action: string;
        created_at: string | Date;
      }>(sql`
        select id, purpose::text as purpose, action::text as action, created_at
        from consent_event
        where membership_id = ${row.membership_id}
        order by created_at desc
        limit 20
      `);
      const birthday = row.birthday ? new Date(row.birthday) : null;
      return {
        restaurantName: row.restaurant_name,
        customerId: row.customer_id,
        membershipId: row.membership_id,
        name: row.name,
        phoneE164: row.phone_e164,
        stampsCurrent: Number(row.stamps_current),
        stampsTotal: Number(row.stamps_total),
        stampsRequired: Number(row.stamps_required),
        rewardsWaiting: Number(row.rewards_waiting),
        lastVisitAt: iso(row.last_visit_at),
        joinedAt: new Date(row.joined_at).toISOString(),
        smsOptedIn: row.marketing_sms === "opted_in",
        birthdayMonth: birthday ? birthday.getUTCMonth() : null,
        birthdayDay: birthday ? birthday.getUTCDate() : null,
        stamps: stamps.rows.map((stamp) => ({
          id: stamp.id,
          createdAt: new Date(stamp.created_at).toISOString(),
          status: stamp.status,
        })),
        rewards: rewards.rows.map((reward) => ({
          id: reward.id,
          description: reward.description,
          status: reward.status,
          earnedAt: new Date(reward.earned_at).toISOString(),
        })),
        consents: consents.rows.map((consent) => ({
          id: consent.id,
          purpose: consent.purpose,
          action: consent.action,
          createdAt: new Date(consent.created_at).toISOString(),
        })),
      };
    },
  );
}

/** One campaign and its recipient messages, scoped to the owner's restaurant. */
/** One campaign and its recipient messages, scoped to the owner's restaurant. */
export async function loadCampaignResults(
  viewer: Viewer,
  campaignId: string,
): Promise<LiveCampaignResults | null> {
  if ((viewer.role !== "owner" && viewer.role !== "manager") || !viewer.restaurantId) {
    return null;
  }
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const head = await transaction.execute<CampaignHeadRow>(sql`
        select
          r.name as restaurant_name,
          c.id,
          c.name,
          c.code,
          c.message_body,
          c.channel::text as channel,
          c.status::text as status,
          coalesce(c.est_recipients, count(m.id), 0)::integer as recipients,
          c.est_cost_cents,
          c.actual_cost_cents,
          c.sent_at,
          c.scheduled_at,
          c.created_at,
          c.requires_approval,
          c.approved_by
        from campaign c
        join restaurant r on r.id = c.restaurant_id
        left join message m on m.campaign_id = c.id
        where c.restaurant_id = ${viewer.restaurantId}
          and c.id = ${campaignId}
        group by r.name, c.id
        limit 1
      `);
      const row = head.rows[0];
      if (!row) return null;

      const messages = await transaction.execute<CampaignMessageRow>(sql`
        select
          m.id,
          cu.name,
          cu.phone_e164,
          m.status::text as status,
          m.segments,
          m.cost_cents,
          m.sent_at,
          m.delivered_at
        from message m
        join membership me on me.id = m.membership_id
        join customer cu on cu.id = me.customer_id
        where m.campaign_id = ${campaignId}
          and m.restaurant_id = ${viewer.restaurantId}
        order by cu.name
      `);

      return {
        restaurantName: row.restaurant_name,
        campaign: {
          id: row.id,
          name: row.name,
          code: row.code,
          body: row.message_body,
          channel: row.channel,
          status: row.status,
          recipients: Number(row.recipients),
          estimatedCostCents:
            row.est_cost_cents === null ? null : Number(row.est_cost_cents),
          actualCostCents: Number(row.actual_cost_cents),
          sentAt: iso(row.sent_at),
          scheduledAt: iso(row.scheduled_at),
          createdAt: new Date(row.created_at).toISOString(),
          requiresApproval: row.requires_approval,
          approved: row.approved_by !== null,
        },
        messages: messages.rows.map((message) => ({
          id: message.id,
          name: message.name,
          phoneE164: message.phone_e164,
          status: message.status,
          segments: Number(message.segments),
          costCents: Number(message.cost_cents),
          sentAt: iso(message.sent_at),
          deliveredAt: iso(message.delivered_at),
        })),
      };
    },
  );
}
