import { createHmac, randomInt, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { deleteCookie, getCookies, setCookie } from "@tanstack/react-start/server";
import { SIGNED_OUT_MESSAGE, UNLOCK_FIRST_MESSAGE } from "@/lib/till-messages";
import type { RewardKind } from "@/lib/reward-copy";
import { runAfterVisitHooks } from "./live-after-visit";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import {
  PIN_FAIL_WINDOW_MINUTES,
  isPinLocked,
  pinHmacHex,
  pinMatches,
  requirePinPepper,
} from "./repos/pg";

// Live till logic for phase D8: team, till pairing, staff PIN sign in and
// reward redemption. Demo mode never imports this file.
//
// SECURITY:
// - Staff PINs are generated here and only their HMAC-SHA256(PIN_PEPPER,
//   restaurant_id:staff_id:pin) is stored. The clear PIN is returned once to
//   the owner and never logged or stored.
// - The till device and the staff session are signed with PIN_PEPPER and a
//   domain separated message, so a cookie cannot be moved to another purpose.
// - Pairing codes are stored as a hash, used once, and rate limited per IP.
// - Every write records an audit_event.

export const PAIR_CODE_MINUTES = 10;
export const PAIR_MAX_FAILS = 5;
export const TILL_SESSION_HOURS = 12;
export const TILL_DEVICE_DAYS = 180;
export const REDEEM_UNDO_MINUTES = 10;

export const TILL_DEVICE_COOKIE = "patron_till_device";
export const TILL_STAFF_COOKIE = "patron_till_staff";

// No 0/O/1/I: the owner reads this aloud or types it on another device.
const PAIR_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type LiveStaffRow = {
  id: string;
  displayName: string;
  active: boolean;
  lastStampAt: string | null;
};

export type LivePairingCode = {
  code: string;
  expiresAt: string;
};

export type TillRestaurant = {
  id: string;
  slug: string;
  name: string;
  stampsRequired: number;
};

export type TillState = {
  paired: boolean;
  restaurant: TillRestaurant | null;
  staff: { id: string; displayName: string } | null;
  expiresAt: number | null;
  crew: Array<{ id: string; displayName: string }>;
};

export type TillSession = {
  restaurantId: string;
  staffId: string;
  expiresAt: number;
};

export type LiveLookup =
  | { ok: false; message: string }
  | {
      ok: true;
      firstName: string;
      lastInitial: string;
      membershipId: string;
      stampsCurrent: number;
      stampsRequired: number;
      rewards: Array<{
        id: string;
        description: string;
        kind: RewardKind;
        percentOff: number | null;
        amountOffCents: number | null;
        useBy: string | null;
      }>;
    };

export type RedeemOutcome =
  | {
      ok: true;
      description: string;
      kind: RewardKind;
      percentOff: number | null;
      amountOffCents: number | null;
      canUndoUntil: number;
    }
  | { ok: false; message: string; code?: "reward_expired" };

export const REWARD_EXPIRED_MESSAGE = "That reward has run out. Tell the guest it has expired.";

/** True SQL fragment: this staff member still exists and is active in this restaurant. */
function staffIsActive(restaurantId: string, staffId: string): SQL {
  return sql`exists (
    select 1 from staff_member s
    where s.id = ${staffId} and s.restaurant_id = ${restaurantId} and s.active = true
  )`;
}

type DbResult<T> = { rows: T[] };

async function q<T>(transaction: DatabaseTransaction, query: SQL): Promise<T[]> {
  const res = (await transaction.execute(query)) as unknown as DbResult<T>;
  return res.rows;
}

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

function isOwner(viewer: Viewer): boolean {
  return viewer.role === "owner" && viewer.restaurantId !== null;
}

async function audit(
  transaction: DatabaseTransaction,
  actorType: "owner" | "staff" | "system",
  actorId: string | null,
  restaurantId: string | null,
  action: string,
  objectType: string,
  objectId: string,
  meta: Record<string, string | number | boolean> = {},
) {
  await transaction.execute(sql`
    insert into audit_event
      (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values
      (${actorType}, ${actorId}, ${restaurantId}, ${action},
       ${objectType}, ${objectId}, ${JSON.stringify(meta)}::jsonb)
  `);
}

// ---------------------------------------------------------------- pure helpers

export function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

export function generatePairingCode(): string {
  let code = "";
  for (let index = 0; index < 8; index++) {
    code += PAIR_ALPHABET[randomInt(0, PAIR_ALPHABET.length)];
  }
  return code;
}

export function normalizePairingCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function pairingCodeHash(pepper: string, code: string): string {
  return createHmac("sha256", pepper)
    .update(`till-pair:v1:${normalizePairingCode(code)}`)
    .digest("hex");
}

export function isPairingCodeUsable(
  row: { used_at: string | null; expires_at: string },
  nowMs: number,
): boolean {
  if (row.used_at !== null) return false;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > nowMs;
}

export function signTillValue(pepper: string, purpose: string, value: string): string {
  const payload = Buffer.from(value, "utf8").toString("base64url");
  const signature = createHmac("sha256", pepper)
    .update(`till-${purpose}:v1:${payload}`)
    .digest("hex");
  return `${payload}.${signature}`;
}

export function readTillValue(pepper: string, purpose: string, raw: string): string | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  // Strict hex: Buffer.from(hex) quietly truncates trailing junk, so a cookie
  // with an appended character would otherwise still verify.
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac("sha256", pepper)
    .update(`till-${purpose}:v1:${payload}`)
    .digest("hex");
  if (!pinMatches(expected, signature)) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function requestCookies(): Record<string, string> {
  try {
    return getCookies();
  } catch {
    return {};
  }
}

function deviceRestaurantId(pepper: string): string | null {
  const raw = requestCookies()[TILL_DEVICE_COOKIE];
  if (!raw) return null;
  const payload = readTillValue(pepper, "device", raw);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { r?: unknown };
    return typeof parsed.r === "string" && parsed.r.length > 0 ? parsed.r : null;
  } catch {
    return null;
  }
}

export function readTillSession(): TillSession | null {
  const pepper = process.env["PIN_PEPPER"];
  if (!pepper) return null;
  const restaurantId = deviceRestaurantId(pepper);
  if (!restaurantId) return null;
  const raw = requestCookies()[TILL_STAFF_COOKIE];
  if (!raw) return null;
  const payload = readTillValue(pepper, "staff", raw);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { r?: unknown; s?: unknown; e?: unknown };
    if (parsed.r !== restaurantId) return null;
    if (typeof parsed.s !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e <= Date.now()) return null;
    return { restaurantId, staffId: parsed.s, expiresAt: parsed.e };
  } catch {
    return null;
  }
}

function setDeviceCookie(pepper: string, restaurantId: string) {
  const device = signTillValue(pepper, "device", JSON.stringify({ r: restaurantId }));
  setCookie(TILL_DEVICE_COOKIE, device, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TILL_DEVICE_DAYS * 24 * 60 * 60,
  });
}

function setSessionCookies(pepper: string, restaurantId: string, staffId: string): number {
  const expiresAt = Date.now() + TILL_SESSION_HOURS * 60 * 60 * 1000;
  setDeviceCookie(pepper, restaurantId);
  const staff = signTillValue(
    pepper,
    "staff",
    JSON.stringify({ r: restaurantId, s: staffId, e: expiresAt }),
  );
  setCookie(TILL_STAFF_COOKIE, staff, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TILL_SESSION_HOURS * 60 * 60,
  });
  return expiresAt;
}

// ---------------------------------------------------------------- team

export async function loadTeam(viewer: Viewer): Promise<{ staff: LiveStaffRow[] } | null> {
  if (!isOwner(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const rows = await q<{
        id: string;
        display_name: string;
        active: boolean;
        last_stamp: string | null;
      }>(
        transaction,
        sql`
          select
            s.id,
            s.display_name,
            s.active,
            (
              select max(e.created_at) from stamp_event e
              where e.staff_id = s.id
                and e.restaurant_id = s.restaurant_id
                and e.status = 'valid'
            ) as last_stamp
          from staff_member s
          where s.restaurant_id = ${viewer.restaurantId}
          order by s.active desc, s.display_name
        `,
      );
      return {
        staff: rows.map((row) => ({
          id: row.id,
          displayName: row.display_name,
          active: row.active,
          lastStampAt: row.last_stamp ? new Date(row.last_stamp).toISOString() : null,
        })),
      };
    },
  );
}

/** A PIN is unique inside one restaurant, so try again up to 5 times. */
async function uniquePin(
  transaction: DatabaseTransaction,
  restaurantId: string,
  pepper: string,
  excludeStaffId: string | null,
): Promise<string> {
  const existing = await q<{ id: string; pin_hmac: string }>(
    transaction,
    sql`
      select id, pin_hmac from staff_member
      where restaurant_id = ${restaurantId}
        ${excludeStaffId ? sql`and id <> ${excludeStaffId}` : sql``}
    `,
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generatePin();
    const taken = existing.some((row) =>
      pinMatches(row.pin_hmac, pinHmacHex(pepper, restaurantId, row.id, candidate)),
    );
    if (!taken) return candidate;
  }
  throw new Error("Could not create a unique PIN. Try again.");
}

export async function addStaffMember(
  viewer: Viewer,
  rawName: string,
): Promise<{ ok: true; staffId: string; pin: string } | { ok: false; message: string }> {
  if (!isOwner(viewer)) return { ok: false, message: "Only the owner can manage the team." };
  const displayName = rawName.trim();
  if (displayName.length < 1 || displayName.length > 40) {
    return { ok: false, message: "Enter a name between 1 and 40 characters." };
  }
  const pepper = requirePinPepper();
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurantId = viewer.restaurantId!;
      const pin = await uniquePin(transaction, restaurantId, pepper, null);
      const staffId = randomUUID();
      const hmac = pinHmacHex(pepper, restaurantId, staffId, pin);
      await q<unknown>(
        transaction,
        sql`
          insert into staff_member (id, restaurant_id, display_name, pin_hmac)
          values (${staffId}, ${restaurantId}, ${displayName}, ${hmac})
        `,
      );
      await audit(
        transaction,
        "owner",
        viewer.userId,
        restaurantId,
        "staff_added",
        "staff_member",
        staffId,
        {
          displayName,
        },
      );
      return { ok: true as const, staffId, pin };
    },
  ).catch(() => ({ ok: false as const, message: "Could not add that staff member." }));
}

export async function setStaffActive(
  viewer: Viewer,
  staffId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isOwner(viewer)) return { ok: false, message: "Only the owner can manage the team." };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const updated = await q<{ id: string }>(
        transaction,
        sql`
          update staff_member set active = ${active}
          where id = ${staffId} and restaurant_id = ${viewer.restaurantId}
          returning id
        `,
      );
      if (!updated[0]) return { ok: false as const, message: "Staff member not found." };
      await audit(
        transaction,
        "owner",
        viewer.userId,
        viewer.restaurantId!,
        active ? "staff_activated" : "staff_deactivated",
        "staff_member",
        staffId,
      );
      return { ok: true as const };
    },
  );
}

export async function resetStaffPin(
  viewer: Viewer,
  staffId: string,
): Promise<{ ok: true; pin: string; displayName: string } | { ok: false; message: string }> {
  if (!isOwner(viewer)) return { ok: false, message: "Only the owner can manage the team." };
  const pepper = requirePinPepper();
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurantId = viewer.restaurantId!;
      const staff = await q<{ id: string; display_name: string }>(
        transaction,
        sql`
          select id, display_name from staff_member
          where id = ${staffId} and restaurant_id = ${restaurantId}
          limit 1
        `,
      );
      const found = staff[0];
      if (!found) return { ok: false as const, message: "Staff member not found." };
      const pin = await uniquePin(transaction, restaurantId, pepper, staffId);
      const hmac = pinHmacHex(pepper, restaurantId, staffId, pin);
      await q<unknown>(
        transaction,
        sql`
          update staff_member set pin_hmac = ${hmac}
          where id = ${staffId} and restaurant_id = ${restaurantId}
        `,
      );
      // Never put the PIN in the audit trail.
      await audit(
        transaction,
        "owner",
        viewer.userId,
        restaurantId,
        "pin_reset",
        "staff_member",
        staffId,
      );
      return { ok: true as const, pin, displayName: found.display_name };
    },
  ).catch(() => ({ ok: false as const, message: "Could not reset that PIN." }));
}

// ---------------------------------------------------------------- pairing

export async function createPairingCode(
  viewer: Viewer,
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; message: string }> {
  if (!isOwner(viewer)) return { ok: false, message: "Only the owner can pair a till." };
  const pepper = requirePinPepper();
  const code = generatePairingCode();
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurantId = viewer.restaurantId!;
      const rows = await q<{ id: string; expires_at: string }>(
        transaction,
        sql`
          insert into one_time_code (kind, restaurant_id, code_hash, expires_at)
          values ('till_pair', ${restaurantId}, ${pairingCodeHash(pepper, code)},
                  now() + make_interval(mins => ${PAIR_CODE_MINUTES}))
          returning id, expires_at
        `,
      );
      const row = rows[0];
      if (!row) return { ok: false as const, message: "Could not create a pairing code." };
      await audit(
        transaction,
        "owner",
        viewer.userId,
        restaurantId,
        "till_pairing_created",
        "one_time_code",
        row.id,
      );
      return {
        ok: true as const,
        code,
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    },
  );
}

export async function pairTill(
  rawCode: string,
  ipHash: string | undefined,
): Promise<{ ok: true; restaurantId: string } | { ok: false; message: string }> {
  const code = normalizePairingCode(rawCode);
  if (code.length !== 8) return { ok: false, message: "That pairing code did not work." };
  const pepper = requirePinPepper();
  const key = ipHash ?? "no-ip";
  const hash = pairingCodeHash(pepper, code);
  const result = await withContext({ databaseUrl: databaseUrl() }, async (transaction) => {
    const hits = await q<{ n: number | string }>(
      transaction,
      sql`
        select count(*)::int as n from rate_limit_hit
        where bucket = 'till-pair' and key = ${key}
          and created_at > now() - make_interval(mins => ${PAIR_CODE_MINUTES})
      `,
    );
    if (Number(hits[0]?.n ?? 0) >= PAIR_MAX_FAILS) {
      return { status: "limited" } as const;
    }
    const rows = await q<{
      id: string;
      code_hash: string;
      expires_at: string;
      used_at: string | null;
    }>(
      transaction,
      sql`
        select id, code_hash, expires_at, used_at from one_time_code
        where kind = 'till_pair' and code_hash = ${hash}
        limit 1
      `,
    );
    const row = rows[0];
    // Constant time compare as well, so a wrong code cannot be timed.
    if (!row || !pinMatches(row.code_hash, hash) || !isPairingCodeUsable(row, Date.now())) {
      await q<unknown>(
        transaction,
        sql`insert into rate_limit_hit (bucket, key) values ('till-pair', ${key})`,
      );
      return { status: "bad" } as const;
    }
    const consumed = await q<{ restaurant_id: string | null }>(
      transaction,
      sql`
        update one_time_code set used_at = now()
        where id = ${row.id} and used_at is null and expires_at > now()
        returning restaurant_id
      `,
    );
    const restaurantId = consumed[0]?.restaurant_id;
    if (!restaurantId) {
      await q<unknown>(
        transaction,
        sql`insert into rate_limit_hit (bucket, key) values ('till-pair', ${key})`,
      );
      return { status: "bad" } as const;
    }
    return { status: "ok", restaurantId } as const;
  });
  if (result.status === "limited") {
    return {
      ok: false,
      message: "Too many tries. Wait a few minutes and ask the owner for a new code.",
    };
  }
  if (result.status !== "ok") return { ok: false, message: "That pairing code did not work." };
  await withContext(
    { databaseUrl: databaseUrl(), restaurantId: result.restaurantId, isOperator: false },
    async (transaction) => {
      await audit(
        transaction,
        "system",
        null,
        result.restaurantId,
        "till_paired",
        "restaurant",
        result.restaurantId,
      );
    },
  );
  setDeviceCookie(pepper, result.restaurantId);
  deleteCookie(TILL_STAFF_COOKIE, { path: "/" });
  return { ok: true, restaurantId: result.restaurantId };
}

export async function loadTillState(): Promise<TillState> {
  const empty: TillState = {
    paired: false,
    restaurant: null,
    staff: null,
    expiresAt: null,
    crew: [],
  };
  const pepper = process.env["PIN_PEPPER"];
  if (!pepper) return empty;
  const restaurantId = deviceRestaurantId(pepper);
  if (!restaurantId) return empty;
  const session = readTillSession();
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const restaurants = await q<{
        id: string;
        slug: string;
        name: string;
        stamps_required: number;
      }>(
        transaction,
        sql`
          select id, slug, name, stamps_required from restaurant
          where id = ${restaurantId} limit 1
        `,
      );
      const restaurant = restaurants[0];
      if (!restaurant) return empty;
      const crewRows = await q<{ id: string; display_name: string }>(
        transaction,
        sql`
          select id, display_name from staff_member
          where restaurant_id = ${restaurantId} and active = true
          order by display_name
        `,
      );
      const crew = crewRows.map((row) => ({ id: row.id, displayName: row.display_name }));
      const signedIn = session ? crew.find((member) => member.id === session.staffId) : undefined;
      if (session && !signedIn) deleteCookie(TILL_STAFF_COOKIE, { path: "/" });
      return {
        paired: true,
        restaurant: {
          id: restaurant.id,
          slug: restaurant.slug,
          name: restaurant.name,
          stampsRequired: restaurant.stamps_required,
        },
        staff: signedIn ?? null,
        expiresAt: signedIn ? session!.expiresAt : null,
        crew,
      };
    },
  );
}

export async function signInTill(
  staffId: string,
  pin: string,
): Promise<{ ok: true; staffId: string; expiresAt: number } | { ok: false; message: string }> {
  const pepper = requirePinPepper();
  const restaurantId = deviceRestaurantId(pepper);
  if (!restaurantId) return { ok: false, message: "Pair this till first." };
  const outcome = await withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (transaction) => {
      const rows = await q<{
        id: string;
        pin_hmac: string;
        fails: number | string;
        last_fail: string | null;
      }>(
        transaction,
        sql`
          select
            s.id,
            s.pin_hmac,
            (
              select count(*)::int from rate_limit_hit
              where bucket = 'pin' and key = ${staffId}
                and created_at > now() - make_interval(mins => ${PIN_FAIL_WINDOW_MINUTES})
            ) as fails,
            (
              select max(created_at) from rate_limit_hit
              where bucket = 'pin' and key = ${staffId}
                and created_at > now() - make_interval(mins => ${PIN_FAIL_WINDOW_MINUTES})
            ) as last_fail
          from staff_member s
          where s.id = ${staffId} and s.restaurant_id = ${restaurantId} and s.active = true
          limit 1
        `,
      );
      const staff = rows[0];
      if (!staff) return { status: "no_staff" } as const;
      const fails = Number(staff.fails ?? 0);
      const lastFail = staff.last_fail ? Date.parse(staff.last_fail) : null;
      if (isPinLocked(fails, lastFail, Date.now())) return { status: "locked" } as const;
      const ok = pinMatches(staff.pin_hmac, pinHmacHex(pepper, restaurantId, staffId, pin));
      if (!ok) {
        // Committed even though the call rejects, so the lockout can trigger.
        await q<unknown>(
          transaction,
          sql`insert into rate_limit_hit (bucket, key) values ('pin', ${staffId})`,
        );
        return { status: "wrong" } as const;
      }
      await audit(transaction, "staff", staffId, restaurantId, "sign_in", "staff_member", staffId);
      return { status: "ok" } as const;
    },
  );
  if (outcome.status === "no_staff") return { ok: false, message: "Pick your name and try again." };
  if (outcome.status === "locked") {
    return { ok: false, message: "That sign-in is locked. Try again later." };
  }
  if (outcome.status !== "ok") return { ok: false, message: "That PIN did not match. Try again." };
  const expiresAt = setSessionCookies(pepper, restaurantId, staffId);
  return { ok: true, staffId, expiresAt };
}

export async function signOutTill(): Promise<{ ok: true }> {
  const pepper = process.env["PIN_PEPPER"];
  const session = pepper ? readTillSession() : null;
  deleteCookie(TILL_STAFF_COOKIE, { path: "/" });
  if (session) {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
      async (transaction) => {
        await audit(
          transaction,
          "staff",
          session.staffId,
          session.restaurantId,
          "sign_out",
          "staff_member",
          session.staffId,
        );
      },
    );
  }
  return { ok: true };
}

export async function unpairTill(): Promise<{ ok: true }> {
  const pepper = process.env["PIN_PEPPER"];
  const session = pepper ? readTillSession() : null;
  const restaurantId = pepper ? deviceRestaurantId(pepper) : null;
  deleteCookie(TILL_STAFF_COOKIE, { path: "/" });
  deleteCookie(TILL_DEVICE_COOKIE, { path: "/" });
  const actor = session?.restaurantId ?? restaurantId;
  if (actor) {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: actor, isOperator: false },
      async (transaction) => {
        await audit(transaction, "system", null, actor, "till_unpaired", "restaurant", actor);
      },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------- till loop

function requireSession(): TillSession | { error: string } {
  const session = readTillSession();
  if (!session) return { error: UNLOCK_FIRST_MESSAGE };
  return session;
}

export async function lookupGuest(rawCode: string): Promise<LiveLookup> {
  const session = requireSession();
  if ("error" in session) return { ok: false, message: session.error };
  const raw = rawCode.trim();
  if (!raw) return { ok: false, message: "Enter a phone number or scan the card." };
  const digits = raw.replace(/\D/g, "");
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
    async (transaction) => {
      const restaurants = await q<{ stamps_required: number; staff_ok: boolean }>(
        transaction,
        sql`
          select r.stamps_required,
                 ${staffIsActive(session.restaurantId, session.staffId)} as staff_ok
          from restaurant r where r.id = ${session.restaurantId} limit 1
        `,
      );
      const restaurant = restaurants[0];
      if (!restaurant)
        return { ok: false as const, message: "That till is not linked to a restaurant." };
      // A deactivated staff member loses the till at once, not when the 12 hour session ends.
      if (!restaurant.staff_ok) return { ok: false as const, message: SIGNED_OUT_MESSAGE };
      const phoneMatch =
        digits.length >= 7
          ? sql`right(regexp_replace(c.phone_e164, '[^0-9]', '', 'g'), 9) = ${digits.slice(-9)}`
          : sql`false`;
      const rows = await q<{
        membership_id: string;
        stamps_current: number;
        name: string;
      }>(
        transaction,
        sql`
          select m.id as membership_id, m.stamps_current, c.name
          from membership m
          join customer c on c.id = m.customer_id
          where m.restaurant_id = ${session.restaurantId}
            and c.erased_at is null
            and (c.qr_token = ${raw} or ${phoneMatch})
          limit 1
        `,
      );
      const member = rows[0];
      if (!member) return { ok: false as const, message: "No member matches that code." };
      const rewardRows = await q<{
        id: string;
        description: string;
        kind: RewardKind;
        percent_off: number | null;
        amount_off_cents: number | null;
        use_by: string | null;
      }>(
        transaction,
        sql`
          select id, description, kind, percent_off, amount_off_cents,
                 to_char(expires_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY') as use_by
          from reward
          where membership_id = ${member.membership_id}
            and restaurant_id = ${session.restaurantId}
            and status = 'available'
            and (expires_at is null or expires_at > now())
          order by earned_at
        `,
      );
      const parts = member.name.trim().split(/\s+/).filter(Boolean);
      return {
        ok: true as const,
        firstName: parts[0] ?? member.name,
        lastInitial: parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "",
        membershipId: member.membership_id,
        stampsCurrent: member.stamps_current,
        stampsRequired: restaurant.stamps_required,
        rewards: rewardRows.map((row) => ({
          id: row.id,
          description: row.description,
          kind: row.kind,
          percentOff: row.percent_off === null ? null : Number(row.percent_off),
          amountOffCents: row.amount_off_cents === null ? null : Number(row.amount_off_cents),
          useBy: row.use_by,
        })),
      };
    },
  );
}

export type TillStampOutcome =
  | { ok: true; result: string; stampsCurrent: number; rewardId: string | null }
  | { ok: false; message: string };

export async function recordStampAtTill(
  membershipId: string,
  key: string,
): Promise<TillStampOutcome> {
  const session = requireSession();
  if ("error" in session) return { ok: false, message: session.error };
  const outcome = await withContext(
    { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
    async (transaction) => {
      const member = await q<{ id: string; staff_ok: boolean }>(
        transaction,
        sql`
          select m.id, ${staffIsActive(session.restaurantId, session.staffId)} as staff_ok
          from membership m
          where m.id = ${membershipId} and m.restaurant_id = ${session.restaurantId}
          limit 1
        `,
      );
      if (!member[0]) return { ok: false as const, message: "That member is not on this list." };
      if (!member[0].staff_ok) return { ok: false as const, message: SIGNED_OUT_MESSAGE };
      const rows = await q<{
        out_result: string;
        out_stamp_id: string | null;
        out_stamps: number | null;
        out_reward_id: string | null;
      }>(
        transaction,
        sql`
          select * from record_stamp(
            ${session.restaurantId}::uuid,
            ${membershipId}::uuid,
            ${session.staffId}::uuid,
            ${key}
          )
        `,
      );
      const row = rows[0];
      if (!row) return { ok: false as const, message: "Could not stamp." };
      await audit(
        transaction,
        "staff",
        session.staffId,
        session.restaurantId,
        `stamp:${row.out_result}`,
        "membership",
        membershipId,
        { staffId: session.staffId },
      );
      return {
        ok: true as const,
        result: row.out_result,
        stampsCurrent: row.out_stamps ?? 0,
        rewardId: row.out_reward_id,
      };
    },
  );
  // Hooks open their own connections, so they run only after the stamp above has committed.
  if (outcome.ok && outcome.result === "stamped") {
    await runAfterVisitHooks({
      restaurantId: session.restaurantId,
      membershipId,
      staffId: session.staffId,
      result: outcome.result,
    });
  }
  return outcome;
}

/** The real redemption. Callers must have a signed in staff member. */
export async function redeemRewardAs(input: {
  restaurantId: string;
  membershipId: string;
  rewardId: string;
  staffId: string;
}): Promise<RedeemOutcome> {
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: input.restaurantId, isOperator: false },
    async (transaction) => {
      const updated = await q<{
        id: string;
        description: string;
        kind: RewardKind;
        percent_off: number | null;
        amount_off_cents: number | null;
      }>(
        transaction,
        sql`
          update reward
          set status = 'redeemed', redeemed_at = now(), redeemed_by_staff = ${input.staffId}
          where id = ${input.rewardId}
            and membership_id = ${input.membershipId}
            and restaurant_id = ${input.restaurantId}
            and status = 'available'
            and (expires_at is null or expires_at > now())
            and ${staffIsActive(input.restaurantId, input.staffId)}
            and exists (
              select 1 from membership m
              where m.id = reward.membership_id and m.restaurant_id = reward.restaurant_id
            )
          returning id, description, kind, percent_off, amount_off_cents
        `,
      );
      const row = updated[0];
      if (!row) {
        const existing = await q<{ status: string; expired: boolean }>(
          transaction,
          sql`
            select status, (expires_at is not null and expires_at <= now()) as expired
            from reward
            where id = ${input.rewardId}
              and membership_id = ${input.membershipId}
              and restaurant_id = ${input.restaurantId}
            limit 1
          `,
        );
        if (existing[0]?.status === "available" && existing[0].expired) {
          return { ok: false as const, message: REWARD_EXPIRED_MESSAGE, code: "reward_expired" };
        }
        return {
          ok: false as const,
          message: existing[0] ? "Already redeemed." : "That reward is not available.",
        };
      }
      await audit(
        transaction,
        "staff",
        input.staffId,
        input.restaurantId,
        "reward_redeemed",
        "reward",
        input.rewardId,
        { membershipId: input.membershipId },
      );
      return {
        ok: true as const,
        description: row.description,
        kind: row.kind,
        percentOff: row.percent_off === null ? null : Number(row.percent_off),
        amountOffCents: row.amount_off_cents === null ? null : Number(row.amount_off_cents),
        canUndoUntil: Date.now() + REDEEM_UNDO_MINUTES * 60 * 1000,
      };
    },
  );
}

export async function redeemRewardAtTill(
  membershipId: string,
  rewardId: string,
): Promise<RedeemOutcome> {
  const session = requireSession();
  if ("error" in session) return { ok: false, message: session.error };
  return redeemRewardAs({
    restaurantId: session.restaurantId,
    membershipId,
    rewardId,
    staffId: session.staffId,
  });
}

export async function undoRedeemAtTill(
  rewardId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = requireSession();
  if ("error" in session) return { ok: false, message: session.error };
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: session.restaurantId, isOperator: false },
    async (transaction) => {
      const updated = await q<{ id: string }>(
        transaction,
        sql`
          update reward
          set status = 'available', redeemed_at = null, redeemed_by_staff = null
          where id = ${rewardId}
            and restaurant_id = ${session.restaurantId}
            and status = 'redeemed'
            and redeemed_by_staff = ${session.staffId}
            and ${staffIsActive(session.restaurantId, session.staffId)}
            and redeemed_at > now() - make_interval(mins => ${REDEEM_UNDO_MINUTES})
          returning id
        `,
      );
      if (!updated[0]) {
        return { ok: false as const, message: "That redemption can no longer be undone." };
      }
      await audit(
        transaction,
        "staff",
        session.staffId,
        session.restaurantId,
        "reward_redeem_undone",
        "reward",
        rewardId,
      );
      return { ok: true as const };
    },
  );
}
