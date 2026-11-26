import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import {
  validateChallenge,
  rewardLine,
  type LiveChallengeInput,
  type ChallengeKind,
  type RewardType,
} from "@/lib/live-challenges";

export type LiveChallenge = LiveChallengeInput & { id: string; claimedByMe: boolean };

/**
 * After a valid visit: claims every active challenge the member has now completed.
 * Progress and the one-claim rule live in SQL (challenge_progress and claim_challenge).
 */
export async function applyChallengeHook(restaurantId: string, membershipId: string): Promise<void> {
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const due = await transaction.execute<{ id: string }>(sql`
        select c.id
        from challenge c
        where c.restaurant_id = ${restaurantId} and c.active
          and challenge_progress(c.id, ${membershipId}) >= c.visits
          and not exists (
            select 1 from challenge_claim cc
            where cc.challenge_id = c.id and cc.membership_id = ${membershipId}
          )
      `);
      for (const row of due.rows) {
        await transaction.execute(sql`
          select * from claim_challenge(${restaurantId}, ${membershipId}, ${row.id}, ${`challenge:${row.id}:${membershipId}`}, null)
        `);
      }
    },
  );
}

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

type ChallengeRow = {
  id: string;
  title: string;
  kind: ChallengeKind;
  visits: number;
  window_days: number;
  weekdays: number[];
  start_hour: number | null;
  end_hour: number | null;
  reward_type: RewardType;
  bonus_stamps: number;
  reward_item: string | null;
  reward_percent_off: number | null;
  reward_amount_off_cents: number | null;
  reward_valid_days: number | null;
  active: boolean;
  menu_item_id: string | null;
  menu_section_id: string | null;
  target_name: string | null;
};

const toChallenge = (row: ChallengeRow): LiveChallenge => ({
  id: row.id,
  title: row.title,
  kind: row.kind,
  visits: Number(row.visits),
  windowDays: Number(row.window_days),
  weekdays: (row.weekdays ?? []).map(Number),
  startHour: row.start_hour === null ? null : Number(row.start_hour),
  endHour: row.end_hour === null ? null : Number(row.end_hour),
  rewardType: row.reward_type,
  bonusStamps: Number(row.bonus_stamps),
  rewardItem: row.reward_item ?? "",
  percentOff: row.reward_percent_off === null ? null : Number(row.reward_percent_off),
  amountOffCents: row.reward_amount_off_cents === null ? null : Number(row.reward_amount_off_cents),
  validDays: row.reward_valid_days === null ? null : Number(row.reward_valid_days),
  active: row.active,
  menuItemId: row.menu_item_id,
  menuSectionId: row.menu_section_id,
  targetName: row.target_name ?? "",
  claimedByMe: false,
});

export async function listChallenges(viewer: Viewer): Promise<LiveChallenge[] | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<ChallengeRow>(sql`
        select id, title, kind, visits, window_days, weekdays, start_hour, end_hour, reward_type,
               bonus_stamps, reward_item, reward_percent_off, reward_amount_off_cents,
               reward_valid_days, active, menu_item_id, menu_section_id,
               case when menu_item_id is not null
                    then (select name from menu_item where id = challenge.menu_item_id)
                    else (select name from menu_section where id = challenge.menu_section_id)
               end as target_name
        from challenge
        where restaurant_id = ${viewer.restaurantId}
        order by created_at desc
      `);
      return result.rows.map(toChallenge);
    },
  );
}

export type GuestChallenge = {
  id: string;
  title: string;
  kind: ChallengeKind;
  visits: number;
  windowDays: number;
  progress: number;
  bonusStamps: number;
  rewardLine: string;
  claimed: boolean;
};

/** Active challenges for one member, with their progress. The membership is read from the server card. */
export async function listGuestChallenges(
  restaurantId: string,
  membershipId: string,
): Promise<GuestChallenge[]> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<
        ChallengeRow & { progress: number; claimed: boolean }
      >(sql`
        select c.id, c.title, c.kind, c.visits, c.window_days, c.weekdays, c.start_hour, c.end_hour,
               c.reward_type, c.bonus_stamps, c.reward_item, c.reward_percent_off,
               c.reward_amount_off_cents, c.reward_valid_days, c.active, c.menu_item_id, c.menu_section_id,
               case when c.menu_item_id is not null
                    then (select name from menu_item where id = c.menu_item_id)
                    else (select name from menu_section where id = c.menu_section_id)
               end as target_name,
               challenge_progress(c.id, ${membershipId}) as progress,
               exists (
                 select 1 from challenge_claim cc
                 where cc.challenge_id = c.id and cc.membership_id = ${membershipId}
               ) as claimed
        from challenge c
        where c.restaurant_id = ${restaurantId} and c.active
        order by c.created_at desc
      `);
      return result.rows.map((row) => {
        const challenge = toChallenge(row);
        return {
          id: challenge.id,
          title: challenge.title,
          kind: challenge.kind,
          visits: challenge.visits,
          windowDays: challenge.windowDays,
          progress: Number(row.progress),
          bonusStamps: challenge.bonusStamps,
          rewardLine: rewardLine(challenge.rewardType, {
            bonusStamps: challenge.bonusStamps,
            item: challenge.rewardItem,
            percent: challenge.percentOff,
            amountCents: challenge.amountOffCents,
          }),
          claimed: Boolean(row.claimed),
        };
      });
    },
  );
}

export async function saveChallenge(
  viewer: Viewer,
  id: string | null,
  input: LiveChallengeInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit its challenges." };
  const valid = validateChallenge(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  const v = valid.value;
  // The query builder spreads a JavaScript list into separate values, so send it as JSON.
  const weekdays = sql`array(
    select jsonb_array_elements_text(${JSON.stringify(v.weekdays)}::text::jsonb)::smallint
  )`;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      if (id) {
        const updated = await transaction.execute<{ id: string }>(sql`
          update challenge
          set title = ${v.title}, kind = ${v.kind}, visits = ${v.visits}, window_days = ${v.windowDays},
              weekdays = ${weekdays}, start_hour = ${v.startHour}, end_hour = ${v.endHour},
              menu_item_id = ${v.menuItemId}, menu_section_id = ${v.menuSectionId},
              reward_type = ${v.rewardType}, bonus_stamps = ${v.bonusStamps}, reward_item = ${v.rewardItem || null},
              reward_percent_off = ${v.percentOff}, reward_amount_off_cents = ${v.amountOffCents},
              reward_valid_days = ${v.validDays}, active = ${v.active}, updated_at = now()
          where id = ${id} and restaurant_id = ${viewer.restaurantId}
          returning id
        `);
        if (!updated.rows[0]) return { ok: false as const, message: "That challenge was not found." };
        return { ok: true as const };
      }
      await transaction.execute(sql`
        insert into challenge (restaurant_id, title, kind, visits, window_days, weekdays, start_hour, end_hour,
                               reward_type, bonus_stamps, reward_item, reward_percent_off,
                               reward_amount_off_cents, reward_valid_days, active, menu_item_id, menu_section_id)
        values (${viewer.restaurantId}, ${v.title}, ${v.kind}, ${v.visits}, ${v.windowDays},
                ${weekdays}, ${v.startHour}, ${v.endHour}, ${v.rewardType}, ${v.bonusStamps},
                ${v.rewardItem || null}, ${v.percentOff}, ${v.amountOffCents}, ${v.validDays}, ${v.active},
                ${v.menuItemId}, ${v.menuSectionId})
      `);
      return { ok: true as const };
    },
  );
}
