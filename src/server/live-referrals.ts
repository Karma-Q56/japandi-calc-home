import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { validateReferrals, type LiveReferralInput } from "@/lib/live-challenges";

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

// Letters and digits without look-alikes (no 0, O, 1, I), as the referral code check in 0018 allows.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "PAL";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

type ReferralSettingsRow = {
  referral_enabled: boolean;
  referral_limit_per_month: number;
  referrer_reward_type: LiveReferralInput["referrerRewardType"];
  referrer_reward_item: string | null;
  referrer_reward_percent_off: number | null;
  referrer_reward_amount_off_cents: number | null;
  friend_reward_type: LiveReferralInput["friendRewardType"];
  friend_reward_item: string | null;
  friend_reward_percent_off: number | null;
  friend_reward_amount_off_cents: number | null;
  referral_reward_valid_days: number | null;
};

const toSettings = (row: ReferralSettingsRow): LiveReferralInput => ({
  enabled: row.referral_enabled,
  limitPerMonth: Number(row.referral_limit_per_month),
  referrerRewardType: row.referrer_reward_type,
  referrerRewardItem: row.referrer_reward_item ?? "",
  referrerPercentOff: row.referrer_reward_percent_off === null ? null : Number(row.referrer_reward_percent_off),
  referrerAmountOffCents: row.referrer_reward_amount_off_cents === null ? null : Number(row.referrer_reward_amount_off_cents),
  friendRewardType: row.friend_reward_type,
  friendRewardItem: row.friend_reward_item ?? "",
  friendPercentOff: row.friend_reward_percent_off === null ? null : Number(row.friend_reward_percent_off),
  friendAmountOffCents: row.friend_reward_amount_off_cents === null ? null : Number(row.friend_reward_amount_off_cents),
  validDays: row.referral_reward_valid_days === null ? null : Number(row.referral_reward_valid_days),
});

export async function loadReferralSettings(viewer: Viewer): Promise<LiveReferralInput | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const result = await transaction.execute<ReferralSettingsRow>(sql`
        select referral_enabled, referral_limit_per_month, referrer_reward_type, referrer_reward_item,
               referrer_reward_percent_off, referrer_reward_amount_off_cents, friend_reward_type,
               friend_reward_item, friend_reward_percent_off, friend_reward_amount_off_cents,
               referral_reward_valid_days
        from restaurant where id = ${viewer.restaurantId} limit 1
      `);
      return result.rows[0] ? toSettings(result.rows[0]) : null;
    },
  );
}

export async function saveReferralSettings(
  viewer: Viewer,
  input: LiveReferralInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canManage(viewer)) return { ok: false, message: "Only this restaurant can edit referrals." };
  const valid = validateReferrals(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  const v = valid.value;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      await transaction.execute(sql`
        update restaurant
        set referral_enabled = ${v.enabled},
            referral_limit_per_month = ${v.limitPerMonth},
            referrer_reward_type = ${v.referrerRewardType},
            referrer_reward_item = ${v.referrerRewardItem || null},
            referrer_reward_percent_off = ${v.referrerPercentOff},
            referrer_reward_amount_off_cents = ${v.referrerAmountOffCents},
            friend_reward_type = ${v.friendRewardType},
            friend_reward_item = ${v.friendRewardItem || null},
            friend_reward_percent_off = ${v.friendPercentOff},
            friend_reward_amount_off_cents = ${v.friendAmountOffCents},
            referral_reward_valid_days = ${v.validDays}
        where id = ${viewer.restaurantId}
      `);
      return { ok: true as const };
    },
  );
}

/** The member's own referral code, created once and kept. Null when referrals are off. */
export async function referralCodeFor(restaurantId: string, membershipId: string): Promise<string | null> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const on = await transaction.execute<{ referral_enabled: boolean }>(sql`
        select referral_enabled from restaurant where id = ${restaurantId} limit 1
      `);
      if (!on.rows[0]?.referral_enabled) return null;
      const existing = await transaction.execute<{ code: string }>(sql`
        select code from referral_code where membership_id = ${membershipId} limit 1
      `);
      if (existing.rows[0]) return existing.rows[0].code;
      const code = newCode();
      await transaction.execute(sql`
        insert into referral_code (restaurant_id, membership_id, code)
        values (${restaurantId}, ${membershipId}, ${code})
        on conflict (membership_id) do nothing
      `);
      const saved = await transaction.execute<{ code: string }>(sql`
        select code from referral_code where membership_id = ${membershipId} limit 1
      `);
      return saved.rows[0]?.code ?? null;
    },
  );
}

/**
 * After a valid visit: rewards the referral once, on the friend's first valid stamp.
 * The SQL function (reward_referral) returns 'rewarded' only on the call that changes the row.
 */
export async function rewardReferralFor(restaurantId: string, friendMembershipId: string): Promise<void> {
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      await transaction.execute(sql`select reward_referral(${restaurantId}, ${friendMembershipId})`);
    },
  );
}

/**
 * Links a new friend to the member who shared a code. Returns why it was refused, if it was.
 * The phone must be new at this restaurant; a member cannot refer themselves.
 */
export async function linkReferral(
  restaurantId: string,
  friendMembershipId: string,
  code: string,
): Promise<"linked" | "not_found" | "self" | "already_linked"> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const referrer = await transaction.execute<{ membership_id: string }>(sql`
        select membership_id from referral_code
        where restaurant_id = ${restaurantId} and code = ${code.trim().toUpperCase()}
        limit 1
      `);
      const referrerId = referrer.rows[0]?.membership_id;
      if (!referrerId) return "not_found" as const;
      if (referrerId === friendMembershipId) return "self" as const;
      const taken = await transaction.execute<{ id: string }>(sql`
        select id from referral where friend_membership_id = ${friendMembershipId} limit 1
      `);
      if (taken.rows[0]) return "already_linked" as const;
      // A phone that already has a card here is not a new friend.
      const carded = await transaction.execute<{ id: string }>(sql`
        select other.id
        from membership friend
        join customer c on c.id = friend.customer_id
        join membership other on other.restaurant_id = friend.restaurant_id
          and other.id <> friend.id
        join customer oc on oc.id = other.customer_id and oc.phone_e164 = c.phone_e164
        where friend.id = ${friendMembershipId} and friend.restaurant_id = ${restaurantId}
        limit 1
      `);
      if (carded.rows[0]) return "already_linked" as const;
      await transaction.execute(sql`
        insert into referral (restaurant_id, referrer_membership_id, friend_membership_id, referrer_code, status)
        values (${restaurantId}, ${referrerId}, ${friendMembershipId}, ${code.trim().toUpperCase()}, 'pending')
      `);
      return "linked" as const;
    },
  );
}
