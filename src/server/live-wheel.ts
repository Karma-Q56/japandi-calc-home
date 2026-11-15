import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import {
  WHEEL_REFUSAL_CODES,
  validateWheel,
  wheelErrorMessage,
  type PrizeType,
  type WheelMode,
  type WheelPrizeInput,
  type WheelSettingsInput,
} from "@/lib/live-wheel";

// The live spin wheel (D12d). The server decides every result in SQL (spin_wheel in migration 0019). The restaurant
// comes from the signed-in owner or manager, and the guest from the signed-in guest, never from the browser.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

/** Read the refusal code the database raised, by exact match on the error chain. */
export function wheelRefusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message: string = current.message;
    const match = WHEEL_REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

/**
 * One hit on a rate limit bucket, counted in its own step so a refused spin still counts. Returns false when the
 * key has used its limit for the past hour.
 */
async function withinLimit(bucket: string, key: string, limit: number): Promise<boolean> {
  return withContext({ databaseUrl: databaseUrl(), isOperator: false }, async (transaction) => {
    const used = await transaction.execute<{ n: number }>(sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = ${bucket} and key = ${key} and created_at > now() - interval '1 hour'
    `);
    if (Number(used.rows[0]?.n ?? 0) >= limit) return false;
    await transaction.execute(sql`insert into rate_limit_hit (bucket, key) values (${bucket}, ${key})`);
    return true;
  });
}

const TOO_MANY = "That is a lot of tries in a short time. Please wait a little and try again.";

export type OwnerWheel = WheelSettingsInput;
export type WheelResult = { ok: true } | { ok: false; message: string };

type ConfigRow = {
  enabled: boolean;
  mode: WheelMode;
  earn_every_visits: number;
  reward_floor_cents: number;
};
type PrizeRow = {
  label: string;
  weight: number;
  prize_type: PrizeType;
  stamps: number | null;
  percent_off: number | null;
  amount_off_cents: number | null;
  value_cents: number;
  valid_days: number | null;
};

/** The saved wheel of the signed-in restaurant, or calm defaults when none is saved yet. */
export async function loadOwnerWheel(viewer: Viewer | null): Promise<OwnerWheel | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const config = await transaction.execute<ConfigRow>(sql`
        select enabled, mode, earn_every_visits, reward_floor_cents
        from spin_config where restaurant_id = ${viewer.restaurantId} limit 1
      `);
      const prizes = await transaction.execute<PrizeRow>(sql`
        select label, weight, prize_type, stamps, percent_off, amount_off_cents, value_cents, valid_days
        from spin_prize where restaurant_id = ${viewer.restaurantId} order by position
      `);
      const row = config.rows[0];
      return {
        enabled: row?.enabled ?? false,
        mode: row?.mode ?? "earned",
        earnEvery: Number(row?.earn_every_visits ?? 5),
        floorCents: Number(row?.reward_floor_cents ?? 0),
        prizes: prizes.rows.map(
          (prize): WheelPrizeInput => ({
            label: prize.label,
            weight: Number(prize.weight),
            type: prize.prize_type,
            stamps: prize.stamps === null ? null : Number(prize.stamps),
            percentOff: prize.percent_off === null ? null : Number(prize.percent_off),
            amountOffCents: prize.amount_off_cents === null ? null : Number(prize.amount_off_cents),
            valueCents: Number(prize.value_cents),
            validDays: prize.valid_days === null ? null : Number(prize.valid_days),
          }),
        ),
      };
    },
  );
}

/** Save the wheel: settings and all prizes in one go. */
export async function saveOwnerWheel(viewer: Viewer | null, input: WheelSettingsInput): Promise<WheelResult> {
  if (!canManage(viewer)) return { ok: false, message: wheelErrorMessage("not_allowed") };
  const problem = validateWheel(input);
  if (problem) return { ok: false, message: problem };
  if (!(await withinLimit("wheel-save", viewer.userId, 60))) return { ok: false, message: TOO_MANY };
  const prizes = input.prizes.map((prize) => ({
    label: prize.label.trim(),
    weight: prize.weight,
    type: prize.type,
    stamps: prize.type === "stamps" ? prize.stamps : null,
    percentOff: prize.type === "percent_off" ? prize.percentOff : null,
    amountOffCents: prize.type === "amount_off" ? prize.amountOffCents : null,
    valueCents: prize.type === "nothing" || prize.type === "stamps" ? 0 : prize.valueCents,
    validDays: prize.type === "nothing" || prize.type === "stamps" ? null : prize.validDays,
  }));
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        await transaction.execute(sql`
          select save_spin_wheel(${viewer.userId}, ${input.enabled}, ${input.mode}, ${input.earnEvery},
            ${input.floorCents}, ${JSON.stringify(prizes)}::jsonb)
        `);
      },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: wheelErrorMessage(wheelRefusalCode(error)) };
  }
}

export type TestSpin = { ok: true; prizeLabel: string; prizeType: PrizeType } | { ok: false; message: string };

/** One draw from the saved wheel for the owner to watch. Uses nobody's spin and creates no reward. */
export async function testOwnerWheel(viewer: Viewer | null): Promise<TestSpin> {
  if (!canManage(viewer)) return { ok: false, message: wheelErrorMessage("not_allowed") };
  if (!(await withinLimit("wheel-test", viewer.userId, 60))) return { ok: false, message: TOO_MANY };
  try {
    return await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      async (transaction) => {
        const result = await transaction.execute<{ out_label: string; out_prize_type: PrizeType }>(sql`
          select * from test_spin_wheel(${viewer.userId})
        `);
        const row = result.rows[0];
        if (!row) return { ok: false as const, message: wheelErrorMessage("no_prizes") };
        return { ok: true as const, prizeLabel: row.out_label, prizeType: row.out_prize_type };
      },
    );
  } catch (error) {
    return { ok: false, message: wheelErrorMessage(wheelRefusalCode(error)) };
  }
}

export type GuestSpinState = {
  enabled: boolean;
  mode: WheelMode | null;
  available: number;
  visitsToNext: number | null;
  earnEvery: number | null;
  prizes: Array<{ id: string; label: string; type: PrizeType }>;
  advertisedReward: string;
};

/** What the signed-in guest sees for one of their own cards. The membership is checked in SQL. */
export async function loadGuestSpin(customerId: string, membershipId: string): Promise<GuestSpinState | null> {
  try {
    return await withContext(
      { databaseUrl: databaseUrl(), customerId, isOperator: false },
      async (transaction) => {
        const result = await transaction.execute<{ state: Record<string, unknown> }>(sql`
          select spin_state_for_guest(${membershipId}) as state
        `);
        const state = result.rows[0]?.state as
          | {
              enabled?: boolean;
              mode?: WheelMode;
              available?: number;
              visitsToNext?: number | null;
              earnEvery?: number | null;
              prizes?: Array<{ id: string; label: string; type: PrizeType }>;
              advertisedReward?: string | null;
            }
          | undefined;
        if (!state) return null;
        return {
          enabled: !!state.enabled,
          mode: state.mode ?? null,
          available: Number(state.available ?? 0),
          visitsToNext: state.visitsToNext ?? null,
          earnEvery: state.earnEvery ?? null,
          prizes: state.prizes ?? [],
          advertisedReward: state.advertisedReward ?? "",
        };
      },
    );
  } catch (error) {
    console.error("guest spin state failed", error);
    return null;
  }
}

export type GuestSpinResult =
  | {
      ok: true;
      repeat: boolean;
      prizeId: string;
      label: string;
      prizeType: PrizeType | null;
      bonusStamps: number | null;
      keptAdvertised: boolean;
    }
  | { ok: false; message: string };

/** The guest spins. The server draws the prize and gives it in one step. A repeated spin id returns the same result. */
export async function guestSpin(customerId: string, membershipId: string, spinId: string): Promise<GuestSpinResult> {
  if (!(await withinLimit("guest-spin", customerId, 40))) return { ok: false, message: TOO_MANY };
  try {
    return await withContext(
      { databaseUrl: databaseUrl(), customerId, isOperator: false },
      async (transaction) => {
        const result = await transaction.execute<{
          out_status: string;
          out_prize_id: string;
          out_label: string;
          out_prize_type: PrizeType | null;
          out_bonus_stamps: number | null;
          out_kept_advertised: boolean;
        }>(sql`select * from spin_wheel(${membershipId}, ${spinId})`);
        const row = result.rows[0];
        if (!row) return { ok: false as const, message: wheelErrorMessage(null) };
        return {
          ok: true as const,
          repeat: row.out_status === "repeat",
          prizeId: row.out_prize_id,
          label: row.out_label,
          prizeType: row.out_prize_type,
          bonusStamps: row.out_bonus_stamps === null ? null : Number(row.out_bonus_stamps),
          keptAdvertised: !!row.out_kept_advertised,
        };
      },
    );
  } catch (error) {
    const code = wheelRefusalCode(error);
    // A guest can only be refused "not_allowed" for a card that is not theirs, which the screen never offers.
    return { ok: false, message: code === "not_allowed" ? "Sign in to your own card to spin." : wheelErrorMessage(code) };
  }
}

/** After a recorded visit: count it towards the guest's next earned spin. Safe to run on every visit. */
export async function applyWheelHook(restaurantId: string, membershipId: string): Promise<void> {
  const { latestVisitStampId } = await import("./live-tools");
  const stampId = await latestVisitStampId(restaurantId, membershipId);
  if (!stampId) return;
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      await transaction.execute(sql`select grant_visit_spin(${restaurantId}, ${membershipId}, ${stampId})`);
    },
  );
}
