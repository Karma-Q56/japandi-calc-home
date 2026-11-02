import { sql } from "drizzle-orm";
import { getConsentWording } from "@/config/consent";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { consentChange } from "@/lib/live-actions";

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

async function audit(
  transaction: DatabaseTransaction,
  viewer: Viewer,
  action: string,
  objectType: string,
  objectId: string,
  meta: Record<string, string | number | boolean> = {},
) {
  await transaction.execute(sql`
    insert into audit_event
      (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values
      ('owner', ${viewer.userId}, ${viewer.restaurantId}, ${action},
       ${objectType}, ${objectId}, ${JSON.stringify(meta)}::jsonb)
  `);
}

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

/** Grant or withdraw SMS consent for one guest. */
export async function setSmsConsent(
  viewer: Viewer,
  membershipId: string,
  enabled: boolean,
): Promise<{ ok: true; enabled: boolean } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can change consent." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ name: string }>(sql`
        select r.name
        from membership m
        join restaurant r on r.id = m.restaurant_id
        where m.id = ${membershipId}
          and m.restaurant_id = ${viewer.restaurantId}
        limit 1
      `);
      const restaurant = row.rows[0];
      if (!restaurant) return { ok: false as const, message: "Guest not found." };

      const change = consentChange(enabled);
      const wording = getConsentWording("marketing_sms", restaurant.name);
      await transaction.execute(sql`
        update membership
        set marketing_sms = ${change.marketingSms}::marketing_status
        where id = ${membershipId}
      `);
      await transaction.execute(sql`
        insert into consent_event
          (membership_id, purpose, action, wording_version, wording_text, source)
        values
          (${membershipId}, 'marketing_sms', ${change.action}::consent_action,
           ${wording.version}, ${wording.text}, 'operator')
      `);
      await audit(transaction, viewer, "consent_changed", "membership", membershipId, {
        purpose: "marketing_sms",
        action: change.action,
      });
      return { ok: true as const, enabled };
    },
  );
}

/** Reveal one phone number and leave a trace. The number never enters the audit row. */
export async function revealPhone(
  viewer: Viewer,
  customerId: string,
): Promise<{ ok: true; phone: string } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can reveal a number." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{ phone_e164: string }>(sql`
        select c.phone_e164
        from customer c
        join membership m on m.customer_id = c.id
        where c.id = ${customerId}
          and m.restaurant_id = ${viewer.restaurantId}
        limit 1
      `);
      const customer = row.rows[0];
      if (!customer) return { ok: false as const, message: "Guest not found." };
      await audit(transaction, viewer, "phone_reveal", "customer", customerId, {
        source: "live_owner_profile",
      });
      return { ok: true as const, phone: customer.phone_e164 };
    },
  );
}

/** Record an owner approval without sending anything. */
export async function approveCampaign(
  viewer: Viewer,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can approve a campaign." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{
        status: string;
        requires_approval: boolean;
        approved_by: string | null;
      }>(sql`
        select status::text as status, requires_approval, approved_by
        from campaign
        where id = ${campaignId}
          and restaurant_id = ${viewer.restaurantId}
        limit 1
      `);
      const campaign = row.rows[0];
      if (!campaign) return { ok: false as const, message: "Campaign not found." };
      if (campaign.approved_by) return { ok: true as const };
      if (campaign.status !== "draft" && campaign.status !== "pending_approval") {
        return { ok: false as const, message: "This campaign can no longer be approved." };
      }
      await transaction.execute(sql`
        update campaign
        set approved_by = ${viewer.userId}, approved_at = now()
        where id = ${campaignId}
      `);
      await audit(transaction, viewer, "campaign_approve", "campaign", campaignId);
      return { ok: true as const };
    },
  );
}

/** Cancel a scheduled campaign, skip its queued messages and release its reservation. */
export async function cancelCampaign(
  viewer: Viewer,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can cancel a campaign." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const row = await transaction.execute<{
        status: string;
        est_cost_cents: number | null;
      }>(sql`
        select status::text as status, est_cost_cents
        from campaign
        where id = ${campaignId}
          and restaurant_id = ${viewer.restaurantId}
        limit 1
      `);
      const campaign = row.rows[0];
      if (!campaign) return { ok: false as const, message: "Campaign not found." };
      if (campaign.status !== "scheduled") {
        return {
          ok: false as const,
          message: "Only a scheduled campaign can be cancelled here.",
        };
      }

      const reserve = Number(campaign.est_cost_cents ?? 0);
      if (reserve > 0) {
        const reference = `release:${campaignId}`;
        const existing = await transaction.execute<{ id: string }>(sql`
          select id from credit_ledger where reference = ${reference} limit 1
        `);
        if (!existing.rows[0]) {
          await transaction.execute(sql`
            insert into credit_ledger
              (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
            values
              (${viewer.restaurantId}, 'release', ${reserve}, ${reference}, ${campaignId},
               ${viewer.userId}, 'Campaign cancelled before sending')
          `);
        }
      }
      await transaction.execute(sql`
        update message
        set status = 'skipped', error_code = 'cancelled'
        where campaign_id = ${campaignId} and status = 'queued'
      `);
      await transaction.execute(sql`
        update campaign set status = 'cancelled' where id = ${campaignId}
      `);
      await audit(transaction, viewer, "campaign_cancel", "campaign", campaignId);
      return { ok: true as const };
    },
  );
}
