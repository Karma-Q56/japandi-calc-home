import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { getDataMode } from "./db/mode";
import {
  makeSpecialCode,
  validateSpecial,
  type LiveSpecialInput,
  type SpecialKind,
} from "@/lib/live-specials";

// Live specials (phase D12e). Demo mode never imports this file.
//
// SECURITY:
// - The restaurant comes from the server session. Owner or manager only.
// - Creating is rate limited per user (20 an hour) through rate_limit_hit.
// - Codes are random, from an alphabet with no look-alike characters, and unique per restaurant.

export const SPECIAL_CREATE_PER_HOUR = 20;

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

export type LiveSpecial = LiveSpecialInput & {
  id: string;
  code: string | null;
  status: "scheduled" | "running" | "paused" | "ended";
  uses: number;
};

type SpecialRow = {
  id: string;
  title: string;
  reward_text: string | null;
  kind: SpecialKind;
  code: string | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  active: boolean;
  percent_off: number | null;
  amount_off_cents: number | null;
  uses: number | string;
};

const iso = (value: Date | string | null): string =>
  value ? new Date(value).toISOString() : "";

/** Local Johannesburg text for the form, e.g. "2026-11-08T18:00". */
const toLocalInput = (value: string): string => {
  if (!value) return "";
  const shifted = new Date(new Date(value).getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
};

/** Status from the dates and the pause switch. "ended" means the end date has passed. */
export function specialStatus(
  row: { active: boolean; starts_at: string; ends_at: string },
  now: Date,
): LiveSpecial["status"] {
  if (!row.active) return "paused";
  if (row.ends_at && new Date(row.ends_at) < now) return "ended";
  if (row.starts_at && new Date(row.starts_at) > now) return "scheduled";
  return "running";
}

const toSpecial = (row: SpecialRow, now: Date): LiveSpecial => {
  const startsAt = iso(row.starts_at);
  const endsAt = iso(row.ends_at);
  return {
    id: row.id,
    title: row.title,
    reward: row.reward_text ?? "",
    kind: row.kind,
    code: row.code,
    startsAt: toLocalInput(startsAt),
    endsAt: toLocalInput(endsAt),
    percentOff: row.percent_off === null ? null : Number(row.percent_off),
    amountOffCents: row.amount_off_cents === null ? null : Number(row.amount_off_cents),
    active: row.active,
    status: specialStatus({ active: row.active, starts_at: startsAt, ends_at: endsAt }, now),
    uses: Number(row.uses),
  };
};

/** All specials for the owner's restaurant, newest first. Null for anyone else. */
export async function listSpecials(viewer: Viewer | null): Promise<LiveSpecial[] | null> {
  if (getDataMode() !== "live" || !canManage(viewer)) return null;
  const restaurantId = viewer.restaurantId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const result = await tx.execute<SpecialRow>(sql`
      select s.id, s.title, s.reward_text, s.kind, s.code, s.starts_at, s.ends_at, s.active,
             s.percent_off, s.amount_off_cents,
             (select count(*)::int from special_use u where u.special_id = s.id) as uses
      from special s
      where s.restaurant_id = ${restaurantId}
      order by s.created_at desc
    `);
    const now = new Date();
    return result.rows.map((row) => toSpecial(row, now));
  });
}

type Outcome = { ok: true; id?: string } | { ok: false; message: string };

async function countCreates(tx: Parameters<Parameters<typeof withContext>[1]>[0], userId: string) {
  const rows = await tx.execute<{ n: number | string }>(sql`
    select count(*)::int as n from rate_limit_hit
    where bucket = 'special-create' and key = ${userId}
      and created_at > now() - interval '1 hour'
  `);
  return Number(rows.rows[0]?.n ?? 0);
}

/** Create or edit a special. A new public or members-only special gets one shared code. */
export async function saveSpecial(
  viewer: Viewer | null,
  id: string | null,
  input: LiveSpecialInput,
): Promise<Outcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only this restaurant can edit its specials." };
  }
  const valid = validateSpecial(input);
  if (!valid.ok) return { ok: false, message: valid.message };
  const v = valid.value;
  const restaurantId = viewer.restaurantId;
  const userId = viewer.userId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    if (id) {
      const updated = await tx.execute<{ id: string }>(sql`
        update special
        set title = ${v.title}, reward_text = ${v.reward}, kind = ${v.kind},
            starts_at = ${v.startsAt || null}, ends_at = ${v.endsAt || null},
            percent_off = ${v.percentOff}, amount_off_cents = ${v.amountOffCents}, active = ${v.active}
        where id = ${id} and restaurant_id = ${restaurantId}
        returning id
      `);
      if (!updated.rows[0]) return { ok: false as const, message: "That special was not found." };
      return { ok: true as const, id };
    }
    if ((await countCreates(tx, userId)) >= SPECIAL_CREATE_PER_HOUR) {
      return { ok: false as const, message: "You have made a lot of specials this hour. Try again later." };
    }
    await tx.execute(sql`insert into rate_limit_hit (bucket, key) values ('special-create', ${userId})`);
    // Public and members-only specials get one shared code. Targeted ones get codes per guest.
    const code = v.kind === "targeted" ? null : makeSpecialCode();
    const created = await tx.execute<{ id: string }>(sql`
      insert into special (restaurant_id, title, reward_text, kind, code, starts_at, ends_at,
                           percent_off, amount_off_cents, active)
      values (${restaurantId}, ${v.title}, ${v.reward}, ${v.kind}, ${code},
              ${v.startsAt || null}, ${v.endsAt || null}, ${v.percentOff}, ${v.amountOffCents}, ${v.active})
      returning id
    `);
    const createdId = created.rows[0]?.id;
    if (!createdId) throw new Error("The special was not saved. Try again.");
    return { ok: true as const, id: createdId };
  });
}

/** Pause or restart a special. Ending sets an end time in the past, so the row is kept. */
export async function setSpecialActive(
  viewer: Viewer | null,
  id: string,
  active: boolean,
): Promise<Outcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only this restaurant can edit its specials." };
  }
  const restaurantId = viewer.restaurantId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const updated = await tx.execute<{ id: string }>(sql`
      update special set active = ${active}
      where id = ${id} and restaurant_id = ${restaurantId}
      returning id
    `);
    if (!updated.rows[0]) return { ok: false as const, message: "That special was not found." };
    return { ok: true as const, id };
  });
}

/** End a special now. The row stays so past uses still show. The app role cannot delete. */
export async function endSpecial(viewer: Viewer | null, id: string): Promise<Outcome> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only this restaurant can edit its specials." };
  }
  const restaurantId = viewer.restaurantId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const updated = await tx.execute<{ id: string }>(sql`
      update special set active = false, ends_at = now()
      where id = ${id} and restaurant_id = ${restaurantId}
      returning id
    `);
    if (!updated.rows[0]) return { ok: false as const, message: "That special was not found." };
    return { ok: true as const, id };
  });
}

/**
 * Issue one unique code for each chosen member of a targeted special. Members who already
 * have a code keep it. Codes are unique per restaurant.
 */
export async function issueTargetedCodes(
  viewer: Viewer | null,
  specialId: string,
  membershipIds: string[],
): Promise<{ ok: true; issued: number } | { ok: false; message: string }> {
  if (getDataMode() !== "live" || !canManage(viewer)) {
    return { ok: false, message: "Only this restaurant can edit its specials." };
  }
  const restaurantId = viewer.restaurantId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const special = await tx.execute<{ kind: SpecialKind }>(sql`
      select kind from special where id = ${specialId} and restaurant_id = ${restaurantId}
    `);
    if (!special.rows[0]) return { ok: false as const, message: "That special was not found." };
    if (special.rows[0].kind !== "targeted") {
      return { ok: false as const, message: "Only targeted specials give each guest a code." };
    }
    let issued = 0;
    for (const membershipId of membershipIds.slice(0, 500)) {
      // A unique code is random, so a clash is rare. Retry a few times before giving up.
      for (let attempt = 0; attempt < 5; attempt++) {
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into special_code (restaurant_id, special_id, membership_id, code)
          select ${restaurantId}, ${specialId}, m.id, ${makeSpecialCode()}
          from membership m
          where m.id = ${membershipId} and m.restaurant_id = ${restaurantId}
          on conflict do nothing
          returning id
        `);
        if (inserted.rows[0]) {
          issued += 1;
          break;
        }
        const existing = await tx.execute<{ id: string }>(sql`
          select id from special_code where special_id = ${specialId} and membership_id = ${membershipId}
        `);
        if (existing.rows[0]) break;
      }
    }
    return { ok: true as const, issued };
  });
}

export type GuestSpecial = {
  id: string;
  title: string;
  reward: string;
  kind: SpecialKind;
  /** The code the guest uses at the till. Null for a special without one. */
  code: string | null;
  endsAt: string;
};

/**
 * The specials this guest may use right now. Public and members-only ones show the shared
 * code. Targeted ones show only this guest's own code. Draft restaurants return nothing.
 */
export async function listGuestSpecials(
  restaurantId: string,
  membershipId: string,
): Promise<GuestSpecial[]> {
  return withContext({ databaseUrl: databaseUrl(), restaurantId, isOperator: false }, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      title: string;
      reward_text: string | null;
      kind: SpecialKind;
      shared_code: string | null;
      own_code: string | null;
      ends_at: Date | string | null;
    }>(sql`
      select s.id, s.title, s.reward_text, s.kind, s.code as shared_code,
             sc.code as own_code, s.ends_at
      from special s
      join restaurant r on r.id = s.restaurant_id and r.status = 'active'
      left join special_code sc on sc.special_id = s.id and sc.membership_id = ${membershipId}
      where s.restaurant_id = ${restaurantId} and s.active
        and (s.starts_at is null or s.starts_at <= now())
        and (s.ends_at is null or s.ends_at >= now())
        and (
          s.kind in ('public', 'members')
          or (s.kind = 'targeted' and sc.id is not null and sc.redeemed_at is null)
        )
      order by s.created_at desc
    `);
    return rows.rows.map((row) => ({
      id: row.id,
      title: row.title,
      reward: row.reward_text ?? "",
      kind: row.kind,
      code: row.kind === "targeted" ? row.own_code : row.shared_code,
      endsAt: iso(row.ends_at),
    }));
  });
}
