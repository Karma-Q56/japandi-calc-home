import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { validateWheel, type WheelInput, type WheelMode, type PrizeType } from "@/lib/live-wheel";

// Live spin wheel (D12d). The server decides every result; the browser only sends the wish.

export type WheelPrize = {
  id: string;
  position: number;
  label: string;
  weight: number;
  rewardType: PrizeType;
  bonusStamps: number | null;
  rewardItem: string;
  percentOff: number | null;
  amountOffCents: number | null;
  validDays: number | null;
};

export type OwnerWheel = WheelInput & { prizes: WheelPrize[] };

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

type WheelRow = {
  spin_enabled: boolean;
  spin_mode: WheelMode;
  spin_earn_every_visits: number;
};

type PrizeRow = {
  id: string;
  position: number;
  label: string;
  weight: number;
  reward_type: PrizeType;
  bonus_stamps: number | null;
  reward_item: string | null;
  reward_percent_off: number | null;
  reward_amount_off_cents: number | null;
  reward_valid_days: number | null;
};

const toPrize = (row: PrizeRow): WheelPrize => ({
  id: row.id,
  position: Number(row.position),
  label: row.label,
  weight: Number(row.weight),
  rewardType: row.reward_type,
  bonusStamps: row.bonus_stamps === null ? null : Number(row.bonus_stamps),
  rewardItem: row.reward_item ?? "",
  percentOff: row.reward_percent_off === null ? null : Number(row.reward_percent_off),
  amountOffCents: row.reward_amount_off_cents === null ? null : Number(row.reward_amount_off_cents),
  validDays: row.reward_valid_days === null ? null : Number(row.reward_valid_days),
});

/** The owner's wheel settings and prizes. Null when the viewer cannot manage this restaurant. */
export async function getOwnerWheel(viewer: Viewer): Promise<OwnerWheel | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const settings = await transaction.execute<WheelRow>(sql`
        select spin_enabled, spin_mode, spin_earn_every_visits
        from restaurant where id = ${viewer.restaurantId}
      `);
      const prizes = await transaction.execute<PrizeRow>(sql`
        select id, position, label, weight, reward_type, bonus_stamps, reward_item,
               reward_percent_off, reward_amount_off_cents, reward_valid_days
        from spin_prize where restaurant_id = ${viewer.restaurantId}
        order by position
      `);
      const row = settings.rows[0];
      return {
        enabled: row?.spin_enabled ?? false,
        mode: row?.spin_mode ?? "earned",
        earnEveryVisits: Number(row?.spin_earn_every_visits ?? 5),
        prizes: prizes.rows.map(toPrize),
      };
    },
  );
}

/** The guest's spins left, and whether the wheel is on. Read from the server card, never the browser. */
export async function guestSpinState(
  restaurantId: string,
  membershipId: string,
): Promise<{ enabled: boolean; spinsLeft: number; mode: WheelMode }> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const settings = await transaction.execute<WheelRow>(sql`
        select spin_enabled, spin_mode, spin_earn_every_visits from restaurant where id = ${restaurantId}
      `);
      const credit = await transaction.execute<{ earned: number; used: number }>(sql`
        select earned, used from spin_credit where membership_id = ${membershipId}
      `);
      const row = credit.rows[0];
      const spinsLeft = row ? Number(row.earned) - Number(row.used) : 0;
      return {
        enabled: settings.rows[0]?.spin_enabled ?? false,
        spinsLeft: Math.max(0, spinsLeft),
        mode: settings.rows[0]?.spin_mode ?? "earned",
      };
    },
  );
}

export type SpinOutcome =
  | { ok: true; result: "won"; label: string; rewardId: string | null; bonusStamps: number | null }
  | { ok: true; result: "duplicate_retry"; label: string; rewardId: string | null; bonusStamps: null }
  | { ok: false; code: string };

/**
 * Spins the wheel once for the guest. The database picks the prize, uses one spin and pays it.
 * The same spinKey never pays twice.
 */
export async function spinGuestWheel(
  restaurantId: string,
  membershipId: string,
  spinKey: string,
): Promise<SpinOutcome> {
  try {
    const result = await withContext(
      { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
      async (transaction) => {
        const rows = await transaction.execute<{
          out_result: string;
          out_label: string | null;
          out_reward_id: string | null;
          out_bonus_stamps: number | null;
        }>(sql`select * from spin_wheel(${membershipId}, ${spinKey})`);
        return rows.rows[0];
      },
    );
    if (!result) return { ok: false, code: "not_allowed" };
    if (result.out_result === "won" || result.out_result === "duplicate_retry") {
      return {
        ok: true,
        result: result.out_result,
        label: result.out_label ?? "",
        rewardId: result.out_reward_id,
        bonusStamps: result.out_bonus_stamps === null ? null : Number(result.out_bonus_stamps),
      } as SpinOutcome;
    }
    return { ok: false, code: result.out_result };
  } catch (error) {
    return { ok: false, code: refusalFrom(error) };
  }
}

/** Reads the database's own refusal code from the error cause chain. Never searches the message text. */
function refusalFrom(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && /^(too_many_prizes|not_a_member|not_allowed)$/.test(message)) {
      return message;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return "unknown";
}

/** After a valid visit: adds spin credit when the guest reaches the wheel's visit count. */
export async function applyWheelVisitHook(restaurantId: string, membershipId: string): Promise<void> {
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const settings = await transaction.execute<WheelRow>(sql`
        select spin_enabled, spin_mode, spin_earn_every_visits from restaurant where id = ${restaurantId}
      `);
      const row = settings.rows[0];
      if (!row?.spin_enabled || row.spin_mode !== "earned") return;
      const every = Number(row.spin_earn_every_visits);
      const visits = await transaction.execute<{ n: number }>(sql`
        select stamps_total as n from membership where id = ${membershipId}
      `);
      const total = Number(visits.rows[0]?.n ?? 0);
      if (total === 0 || total % every !== 0) return;
      await transaction.execute(sql`
        select give_spin_credit(${restaurantId}, ${membershipId}, 1)
      `);
    },
  );
}

/**
 * Saves the wheel settings and replaces the prize list in one transaction.
 * The owner's input is validated here and again by the database constraints.
 */
export async function saveOwnerWheel(
  viewer: Viewer,
  input: WheelInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only the owner or a manager can change the wheel." };
  const problems = validateWheel(input);
  if (problems.length > 0) return { ok: false, message: problems[0]! };
  const restaurantId = viewer.restaurantId;
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          update restaurant
             set spin_enabled = ${input.enabled},
                 spin_mode = ${input.mode},
                 spin_earn_every_visits = ${input.earnEveryVisits}
           where id = ${restaurantId}
        `);
        await transaction.execute(sql`delete from spin_prize where restaurant_id = ${restaurantId}`);
        for (const [index, p] of input.prizes.entries()) {
          await transaction.execute(sql`
            insert into spin_prize (restaurant_id, position, label, weight, reward_type, bonus_stamps,
                                    reward_item, reward_percent_off, reward_amount_off_cents, reward_valid_days)
            values (${restaurantId}, ${index + 1}, ${p.label.trim()}, ${p.weight}, ${p.rewardType},
                    ${p.rewardType === "stamps" ? p.bonusStamps : null},
                    ${p.rewardType === "free_item" ? p.rewardItem.trim() : null},
                    ${p.rewardType === "percent_off" ? p.percentOff : null},
                    ${p.rewardType === "amount_off" ? p.amountOffCents : null},
                    ${p.validDays})
          `);
        }
      },
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "We could not save the wheel. Please try again." };
  }
}
