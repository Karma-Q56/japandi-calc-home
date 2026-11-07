import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import {
  validateTiers,
  validateTools,
  type LiveTiersInput,
  type LiveToolsInput,
} from "@/lib/live-tools";

export type LiveToolsSettings = LiveToolsInput & { toolStampsUsed: number };
export type LiveTiers = LiveTiersInput;

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

type ToolsRow = {
  double_stamp_enabled: boolean;
  double_stamp_weekday: number;
  streak_enabled: boolean;
  streak_weeks: number;
  streak_weekly_visits: number;
  streak_bonus_stamps: number;
  tool_stamp_budget: number;
  birthday_reward: boolean;
  birthday_reward_kind: "stamp" | "freeItem";
  birthday_reward_item: string | null;
  mystery_every_visits: number;
  tiers: { regular: number; vip: number };
  used: number;
};

const toTools = (row: ToolsRow): LiveToolsSettings => ({
  doubleStampEnabled: row.double_stamp_enabled,
  doubleStampWeekday: Number(row.double_stamp_weekday),
  streakEnabled: row.streak_enabled,
  streakWeeks: Number(row.streak_weeks),
  streakWeeklyVisits: Number(row.streak_weekly_visits),
  streakBonusStamps: Number(row.streak_bonus_stamps),
  toolStampBudget: Number(row.tool_stamp_budget),
  birthdayReward: row.birthday_reward,
  birthdayRewardKind: row.birthday_reward_kind,
  birthdayRewardItem: row.birthday_reward_item ?? "",
  mysteryEveryVisits: Number(row.mystery_every_visits),
  toolStampsUsed: Number(row.used),
});

// Bonus stamps given this Johannesburg month, using the same keys as the SQL budget check.
const usedSql = sql`(
  select count(*)::int from stamp_event
  where restaurant_id = restaurant.id and status = 'valid' and reason in ('bonus', 'missyou')
    and (idempotency_key like 'double:%' or idempotency_key like 'streak:%' or idempotency_key like 'missyou:%')
    and created_at >= date_trunc('month', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
) as used`;

export async function loadTools(viewer: Viewer): Promise<LiveToolsSettings | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<ToolsRow>(sql`
        select double_stamp_enabled, double_stamp_weekday, streak_enabled, streak_weeks,
               streak_weekly_visits, streak_bonus_stamps, tool_stamp_budget,
               birthday_reward, birthday_reward_kind, birthday_reward_item,
               mystery_every_visits, tiers, ${usedSql}
        from restaurant
        where id = ${viewer.restaurantId}
        limit 1
      `);
      return result.rows[0] ? toTools(result.rows[0]) : null;
    },
  );
}

export async function saveTools(
  viewer: Viewer,
  input: LiveToolsInput,
): Promise<{ ok: true; settings: LiveToolsSettings } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its tools." };
  const valid = validateTools(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  const v = valid.value;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const limit = await transaction.execute<{ n: number }>(sql`
        select count(*)::int as n from rate_limit_hit
        where bucket = 'tools-save' and key = ${viewer.userId}
          and created_at > now() - interval '1 hour'
      `);
      if (Number(limit.rows[0]?.n ?? 0) >= 20) {
        return { ok: false as const, message: "Too many saves in an hour. Try again later." };
      }
      await transaction.execute(sql`
        insert into rate_limit_hit (bucket, key) values ('tools-save', ${viewer.userId})
      `);
      const result = await transaction.execute<ToolsRow>(sql`
        update restaurant
        set double_stamp_enabled = ${v.doubleStampEnabled},
            double_stamp_weekday = ${v.doubleStampWeekday},
            streak_enabled = ${v.streakEnabled},
            streak_weeks = ${v.streakWeeks},
            streak_weekly_visits = ${v.streakWeeklyVisits},
            streak_bonus_stamps = ${v.streakBonusStamps},
            tool_stamp_budget = ${v.toolStampBudget},
            birthday_reward = ${v.birthdayReward},
            birthday_reward_kind = ${v.birthdayRewardKind},
            birthday_reward_item = ${v.birthdayRewardItem || null},
            mystery_every_visits = ${v.mysteryEveryVisits},
            updated_at = now()
        where id = ${viewer.restaurantId}
        returning double_stamp_enabled, double_stamp_weekday, streak_enabled, streak_weeks,
                  streak_weekly_visits, streak_bonus_stamps, tool_stamp_budget,
                  birthday_reward, birthday_reward_kind, birthday_reward_item,
                  mystery_every_visits, tiers, ${usedSql}
      `);
      const row = result.rows[0];
      if (!row) return { ok: false as const, message: "Restaurant not found." };
      await transaction.execute(sql`
        insert into audit_event
          (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values
          ('owner', ${viewer.userId}, ${viewer.restaurantId}, 'loyalty_tools_updated',
           'restaurant', ${viewer.restaurantId},
           ${JSON.stringify({
             doubleStampEnabled: v.doubleStampEnabled,
             streakEnabled: v.streakEnabled,
             toolStampBudget: v.toolStampBudget,
             birthdayReward: v.birthdayReward,
             mysteryEveryVisits: v.mysteryEveryVisits,
           })}::jsonb)
      `);
      return { ok: true as const, settings: toTools(row) };
    },
  );
}

export async function loadTiers(viewer: Viewer): Promise<LiveTiers | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<{ tiers: { regular: number; vip: number } }>(sql`
        select tiers from restaurant where id = ${viewer.restaurantId} limit 1
      `);
      const tiers = result.rows[0]?.tiers;
      return tiers ? { regular: Number(tiers.regular), vip: Number(tiers.vip) } : null;
    },
  );
}

export async function saveTiers(
  viewer: Viewer,
  input: LiveTiersInput,
): Promise<{ ok: true; tiers: LiveTiers } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its tiers." };
  const valid = validateTiers(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const tiers = { regular: valid.value.regular, vip: valid.value.vip };
      const result = await transaction.execute<{ tiers: { regular: number; vip: number } }>(sql`
        update restaurant
        set tiers = ${JSON.stringify(tiers)}::jsonb, updated_at = now()
        where id = ${viewer.restaurantId}
        returning tiers
      `);
      if (!result.rows[0]) return { ok: false as const, message: "Restaurant not found." };
      await transaction.execute(sql`
        insert into audit_event
          (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values
          ('owner', ${viewer.userId}, ${viewer.restaurantId}, 'guest_tiers_updated',
           'restaurant', ${viewer.restaurantId}, ${JSON.stringify(tiers)}::jsonb)
      `);
      return { ok: true as const, tiers };
    },
  );
}

/** Runs the bonus and birthday/mystery SQL functions for one visit stamp (called from the after-visit hook). */
export async function applyVisitBonuses(
  restaurantId: string,
  membershipId: string,
  stampId: string,
): Promise<void> {
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      await transaction.execute(sql`
        select apply_visit_bonuses(${membershipId}::uuid, ${stampId}::uuid)
      `);
      await transaction.execute(sql`
        select apply_birthday_and_mystery(${membershipId}::uuid, ${stampId}::uuid)
      `);
    },
  );
}

/** Newest valid visit stamp for this guest, used by the after-visit bonus hook. */
export async function latestVisitStampId(
  restaurantId: string,
  membershipId: string,
): Promise<string | null> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<{ id: string }>(sql`
        select id from stamp_event
        where membership_id = ${membershipId} and status = 'valid' and reason = 'visit'
        order by created_at desc
        limit 1
      `);
      return result.rows[0]?.id ?? null;
    },
  );
}
