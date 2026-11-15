import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { validateLoyaltySettings, type LiveLoyaltyInput, type LiveRewardKind } from "@/lib/live-loyalty";

export type LiveLoyaltySettings = {
  restaurantName: string;
  stampsRequired: number;
  rewardDescription: string;
  rewardKind: LiveRewardKind;
  rewardPercentOff: number | null;
  rewardAmountOffCents: number | null;
  rewardValidDays: number | null;
  visitWindowMinutes: number;
  welcomeStamp: boolean;
  marketingWeeklyCap: number;
  memberWeeklyCap: number;
};

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

type SettingsRow = {
  name: string;
  stamps_required: number;
  reward_description: string;
  reward_kind: LiveRewardKind;
  reward_percent_off: number | null;
  reward_amount_off_cents: number | null;
  reward_valid_days: number | null;
  visit_window_minutes: number;
  welcome_stamp: boolean;
  marketing_weekly_cap: number;
  member_weekly_cap: number;
};

const toNumberOrNull = (value: number | null) => (value === null ? null : Number(value));

const toSettings = (row: SettingsRow): LiveLoyaltySettings => ({
  restaurantName: row.name,
  stampsRequired: Number(row.stamps_required),
  rewardDescription: row.reward_description,
  rewardKind: row.reward_kind,
  rewardPercentOff: toNumberOrNull(row.reward_percent_off),
  rewardAmountOffCents: toNumberOrNull(row.reward_amount_off_cents),
  rewardValidDays: toNumberOrNull(row.reward_valid_days),
  visitWindowMinutes: Number(row.visit_window_minutes),
  welcomeStamp: row.welcome_stamp,
  marketingWeeklyCap: Number(row.marketing_weekly_cap),
  memberWeeklyCap: Number(row.member_weekly_cap),
});

export async function loadLoyaltySettings(viewer: Viewer): Promise<LiveLoyaltySettings | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<SettingsRow>(sql`
        select name, stamps_required, reward_description, reward_kind, reward_percent_off,
               reward_amount_off_cents, reward_valid_days, visit_window_minutes,
               welcome_stamp, marketing_weekly_cap, member_weekly_cap
        from restaurant
        where id = ${viewer.restaurantId}
        limit 1
      `);
      return result.rows[0] ? toSettings(result.rows[0]) : null;
    },
  );
}

export async function saveLoyaltySettings(
  viewer: Viewer,
  input: LiveLoyaltyInput,
): Promise<{ ok: true; settings: LiveLoyaltySettings } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its rules." };
  const valid = validateLoyaltySettings(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<SettingsRow>(sql`
        update restaurant
        set stamps_required = ${input.stampsRequired},
            reward_description = ${valid.reward},
            reward_kind = ${input.rewardKind},
            reward_percent_off = ${input.rewardPercentOff},
            reward_amount_off_cents = ${input.rewardAmountOffCents},
            reward_valid_days = ${input.rewardValidDays},
            visit_window_minutes = ${input.visitWindowMinutes},
            welcome_stamp = ${input.welcomeStamp},
            marketing_weekly_cap = ${input.marketingWeeklyCap},
            member_weekly_cap = ${input.memberWeeklyCap},
            updated_at = now()
        where id = ${viewer.restaurantId}
        returning name, stamps_required, reward_description, reward_kind, reward_percent_off,
                  reward_amount_off_cents, reward_valid_days, visit_window_minutes,
                  welcome_stamp, marketing_weekly_cap, member_weekly_cap
      `);
      const row = result.rows[0];
      if (!row) return { ok: false as const, message: "Restaurant not found." };
      await transaction.execute(sql`
        insert into audit_event
          (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values
          ('owner', ${viewer.userId}, ${viewer.restaurantId}, 'loyalty_settings_updated',
           'restaurant', ${viewer.restaurantId},
           ${JSON.stringify({
             stampsRequired: input.stampsRequired,
             rewardKind: input.rewardKind,
             visitWindowMinutes: input.visitWindowMinutes,
             welcomeStamp: input.welcomeStamp,
           })}::jsonb)
      `);
      return { ok: true as const, settings: toSettings(row) };
    },
  );
}
