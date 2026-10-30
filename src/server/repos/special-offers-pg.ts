import { sql, type SQL } from "drizzle-orm";
import { withContext, type DatabaseTransaction } from "@/server/db";
import type { SpecialOfferView } from "./contracts";

type Ctx = {
  databaseUrl: string;
  restaurantId?: string | null;
  customerId?: string | null;
  isOperator?: boolean;
};

async function q<T>(tx: DatabaseTransaction, query: SQL): Promise<T[]> {
  const res = (await tx.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

interface SpecialWithCodeRow {
  id: string;
  title: string;
  body: string | null;
  kind: "public" | "members" | "targeted";
  code: string | null;
  min_tier: string | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  personal_code: string | null;
  redeemed: boolean;
}

const TIERS = ["new", "regular", "vip"] as const;

function tierMeets(tier: string, minTier: string | null): boolean {
  if (!minTier) return true;
  return TIERS.indexOf(tier as (typeof TIERS)[number]) >= TIERS.indexOf(minTier as (typeof TIERS)[number]);
}

async function tierFor(
  tx: DatabaseTransaction,
  membershipId: string,
  restaurantId: string,
): Promise<string> {
  const visits = await q<{ n: string | number }>(
    tx,
    sql`select count(*)::int as n from stamp_event where membership_id = ${membershipId} and status = 'valid' and coalesce(reason, 'visit') = 'visit' and created_at > now() - interval '90 days'`,
  );
  const tiers = await q<{ tiers: { regular?: number; vip?: number } | null }>(
    tx,
    sql`select tiers from restaurant where id = ${restaurantId}`,
  );
  const config = tiers[0]?.tiers ?? {};
  const count = Number(visits[0]?.n ?? 0);
  if (count >= (config.vip ?? 8)) return "vip";
  if (count >= (config.regular ?? 3)) return "regular";
  return "new";
}

export async function pgGetSpecialOffers(
  ctx: Ctx,
  membershipId: string,
): Promise<SpecialOfferView[]> {
  return withContext(ctx, async (tx) => {
    const memberships = await q<{ id: string; restaurant_id: string }>(
      tx,
      sql`select id, restaurant_id from membership where id = ${membershipId} limit 1`,
    );
    const membership = memberships[0];
    if (!membership) return [];
    const tier = await tierFor(tx, membershipId, membership.restaurant_id);
    const rows = await q<SpecialWithCodeRow>(
      tx,
      sql`select s.id, s.title, s.body, s.kind, s.code, s.min_tier, s.active, s.starts_at, s.ends_at,
                 sc.code as personal_code,
                 exists (select 1 from redemption r where r.special_id = s.id and r.membership_id = ${membershipId}) as redeemed
          from special s
          left join special_code sc on sc.special_id = s.id and sc.membership_id = ${membershipId}
          where s.restaurant_id = ${membership.restaurant_id} and s.active = true
          order by s.created_at desc`,
    );
    const now = Date.now();
    return rows
      .filter((row) => {
        if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
        if (row.ends_at && new Date(row.ends_at).getTime() < now) return false;
        if (row.kind === "targeted") return !!row.personal_code;
        if (row.kind === "members") return tierMeets(tier, row.min_tier);
        return true;
      })
      .map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        kind: row.kind,
        code: row.kind === "targeted" ? row.personal_code : row.code,
        minTier: row.min_tier,
        redeemed: row.redeemed,
      }));
  });
}

export async function pgRedeemSpecial(
  ctx: Ctx,
  input: { restaurantId: string; membershipId: string; code: string; actorId: string },
): Promise<{ ok: true; title: string; code: string } | { ok: false; message: string }> {
  const needle = input.code.trim().toUpperCase();
  if (!needle) return { ok: false, message: "Enter an offer code." };
  return withContext({ ...ctx, restaurantId: input.restaurantId }, async (tx) => {
    const memberships = await q<{ id: string; restaurant_id: string }>(
      tx,
      sql`select id, restaurant_id from membership where id = ${input.membershipId} and restaurant_id = ${input.restaurantId} limit 1`,
    );
    if (!memberships[0]) {
      return { ok: false, message: "That guest was not on this restaurant's list." };
    }

    const targeted = await q<{
      code_id: string;
      membership_id: string;
      code: string;
      redeemed_at: string | null;
      special_id: string;
      title: string;
      active: boolean;
      starts_at: string | null;
      ends_at: string | null;
    }>(
      tx,
      sql`select sc.id as code_id, sc.membership_id, sc.code, sc.redeemed_at, sc.special_id,
                 s.title, s.active, s.starts_at, s.ends_at
          from special_code sc join special s on s.id = sc.special_id
          where sc.restaurant_id = ${input.restaurantId} and upper(sc.code) = ${needle} limit 1`,
    );
    const personal = targeted[0];
    if (personal) {
      if (personal.membership_id !== input.membershipId) {
        return { ok: false, message: "This offer is for another member." };
      }
      if (personal.redeemed_at) {
        return { ok: false, message: "That code has already been used." };
      }
      if (!personal.active) return { ok: false, message: "That offer is not active." };
      const now = Date.now();
      if (personal.starts_at && new Date(personal.starts_at).getTime() > now) {
        return { ok: false, message: "That offer has not started." };
      }
      if (personal.ends_at && new Date(personal.ends_at).getTime() < now) {
        return { ok: false, message: "That offer has expired." };
      }
      await q<unknown>(
        tx,
        sql`update special_code set redeemed_at = now(), redeemed_by = ${input.actorId} where id = ${personal.code_id}`,
      );
      await q<unknown>(
        tx,
        sql`insert into redemption (restaurant_id, membership_id, kind, special_id, special_code_id, code, redeemed_by)
            values (${input.restaurantId}, ${input.membershipId}, 'special', ${personal.special_id}, ${personal.code_id}, ${personal.code}, ${input.actorId})`,
      );
      return { ok: true, title: personal.title, code: personal.code };
    }

    const shared = await q<{
      id: string;
      title: string;
      kind: "public" | "members";
      code: string;
      min_tier: string | null;
      active: boolean;
      starts_at: string | null;
      ends_at: string | null;
    }>(
      tx,
      sql`select id, title, kind, code, min_tier, active, starts_at, ends_at
          from special
          where restaurant_id = ${input.restaurantId} and upper(code) = ${needle} and kind <> 'targeted'
          limit 1`,
    );
    const special = shared[0];
    if (!special) return { ok: false, message: "That offer code was not found." };
    if (!special.active) return { ok: false, message: "That offer is not active." };
    const now = Date.now();
    if (special.starts_at && new Date(special.starts_at).getTime() > now) {
      return { ok: false, message: "That offer has not started." };
    }
    if (special.ends_at && new Date(special.ends_at).getTime() < now) {
      return { ok: false, message: "That offer has expired." };
    }
    if (special.kind === "members") {
      const tier = await tierFor(tx, input.membershipId, input.restaurantId);
      if (!tierMeets(tier, special.min_tier)) {
        return { ok: false, message: "This offer is for another member." };
      }
    }
    const already = await q<{ n: string | number }>(
      tx,
      sql`select count(*)::int as n from redemption where special_id = ${special.id} and membership_id = ${input.membershipId}`,
    );
    if (Number(already[0]?.n ?? 0) > 0) {
      return { ok: false, message: "That offer was already redeemed by this member." };
    }
    await q<unknown>(
      tx,
      sql`insert into redemption (restaurant_id, membership_id, kind, special_id, code, redeemed_by)
          values (${input.restaurantId}, ${input.membershipId}, 'special', ${special.id}, ${special.code}, ${input.actorId})`,
    );
    return { ok: true, title: special.title, code: special.code };
  });
}
