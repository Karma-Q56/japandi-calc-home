import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { withAuth } from "./auth";
import { withContext } from "./db";
import { isValidSAMobile, normalizePhone, PHONE_TAKEN_MESSAGE } from "@/lib/phone";

export type ViewerRole = "guest" | "owner" | "manager" | "operator";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  role: ViewerRole;
  restaurantId: string | null;
  customerId: string | null;
  needsPhone: boolean;
  /** The number on this login is already on another card, so no card was made. */
  phoneTaken?: boolean;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string | null;
};

type AppUserRow = {
  user_id: string;
  role: ViewerRole;
  restaurant_id: string | null;
  customer_id: string | null;
};

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

/**
 * Link the signed-in auth user to our own rows. A new login is a guest and gets a customer
 * row once it has a free phone number. Owners and operators sign up first and are then
 * linked by hand (see docs/auth-setup.md). A row is only ever used by the login that
 * made it, because email addresses are not checked.
 */
export async function ensureViewer(user: AuthUser, email: string): Promise<Viewer> {
  // The card needs a name of 1 to 80 characters, whatever the sign-up sent.
  const name = user.name.trim().slice(0, 80).trim() || "Guest";
  const existing = await withContext(
    { databaseUrl: databaseUrl(), isOperator: true },
    async (transaction) => {
      const result = await transaction.execute<AppUserRow>(sql`
        select user_id, role, restaurant_id, customer_id
        from app_user
        where user_id = ${user.id} or email = ${email.toLowerCase()}
        order by (user_id = ${user.id}) desc
        limit 1
      `);
      return result.rows[0] ?? null;
    },
  );

  // The row belongs to a different login that used this email. Email addresses are not
  // checked, so this login gets none of its access. Patron has to link it by hand.
  if (existing && existing.user_id !== user.id) {
    return {
      userId: user.id,
      email,
      name: user.name,
      role: "guest",
      restaurantId: null,
      customerId: null,
      needsPhone: false,
    };
  }

  // A guest who still has no card (no number yet, or a number we could not use) carries on
  // below, so their card is made as soon as we have a number that is free.
  const unfinished =
    existing?.role === "guest" &&
    existing.customer_id === null &&
    existing.restaurant_id === null;

  if (existing && !unfinished) {
    return {
      userId: user.id,
      email,
      name: user.name,
      role: existing.role,
      restaurantId: existing.restaurant_id,
      customerId: existing.customer_id,
      needsPhone: false,
    };
  }

  const phone = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;
  if (!phone || !isValidSAMobile(phone)) {
    // OAuth users arrive without a phone. They finish the profile before a
    // card can be created.
    await withContext({ databaseUrl: databaseUrl(), isOperator: true }, async (tx) => {
      await tx.execute(sql`
        insert into app_user (user_id, email, role, updated_at)
        values (${user.id}, ${email.toLowerCase()}, 'guest', now())
        on conflict (user_id) do nothing
      `);
    });
    return {
      userId: user.id,
      email,
      name: user.name,
      role: "guest",
      restaurantId: null,
      customerId: null,
      needsPhone: true,
    };
  }

  const customerId = await withContext(
    { databaseUrl: databaseUrl(), isOperator: true },
    async (transaction) => {
      // Only ever this login's own row. A row that holds the same number but belongs to
      // someone else is never linked here, because the number has not been checked.
      const created = await transaction.execute<{ id: string }>(sql`
        insert into customer (user_id, phone_e164, name)
        values (${user.id}, ${phone}, ${name})
        on conflict do nothing
        returning id
      `);
      let id = created.rows[0]?.id;
      if (!id) {
        const own = await transaction.execute<{ id: string }>(sql`
          update customer set name = ${name} where user_id = ${user.id} returning id
        `);
        id = own.rows[0]?.id;
      }
      await transaction.execute(sql`
        insert into app_user (user_id, email, role, customer_id, updated_at)
        values (${user.id}, ${email.toLowerCase()}, 'guest', ${id ?? null}, now())
        on conflict (user_id) do update
          set email = excluded.email, customer_id = excluded.customer_id, updated_at = now()
      `);
      return id ?? null;
    },
  );

  return {
    userId: user.id,
    email,
    name: user.name,
    role: "guest",
    restaurantId: null,
    customerId,
    needsPhone: customerId === null,
    ...(customerId === null ? { phoneTaken: true } : {}),
  };
}

function readSession() {
  const headers = getRequestHeaders();
  return withAuth((auth) => auth.api.getSession({ headers }));
}

/** Read the session on the server. Shared by every live server function. */
export async function readViewer(): Promise<Viewer | null> {
  const session = await readSession();
  if (!session?.user?.email) return null;
  return ensureViewer(
    {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phoneNumber:
        (session.user as { phoneNumber?: string | null }).phoneNumber ?? null,
    },
    session.user.email,
  );
}

/** The one place a route learns who is signed in. Returns null when signed out. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(readViewer);

const PHONE_TRIES_PER_HOUR = 5;

/**
 * Count one try at adding a number. The answer says whether a number is already on a card,
 * so each login only gets a few goes an hour.
 */
export async function takePhoneTry(userId: string): Promise<boolean> {
  return withContext({ databaseUrl: databaseUrl(), isOperator: true }, async (tx) => {
    // One try at a time per login, so requests sent together cannot all slip under the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`add-phone:${userId}`}))`);
    const hits = await tx.execute<{ n: number | string }>(sql`
      select count(*)::int as n from rate_limit_hit
      where bucket = 'add-phone' and key = ${userId} and created_at > now() - interval '1 hour'
    `);
    if (Number(hits.rows[0]?.n ?? 0) >= PHONE_TRIES_PER_HOUR) return false;
    await tx.execute(sql`insert into rate_limit_hit (bucket, key) values ('add-phone', ${userId})`);
    return true;
  });
}

/** Finish a Google profile with the phone the guest wants on their card. */
export async function completePhone(phoneInput: string) {
  const session = await readSession();
  if (!session?.user?.email) {
    return { ok: false as const, message: "Sign in again to finish your details." };
  }
  const phone = normalizePhone(phoneInput);
  if (!phone || !isValidSAMobile(phone)) {
    return { ok: false as const, message: "Enter a valid South African mobile number." };
  }
  if (!(await takePhoneTry(session.user.id))) {
    return {
      ok: false as const,
      message: "Too many tries. Wait an hour, then try again.",
    };
  }
  await withContext({ databaseUrl: databaseUrl(), isOperator: true }, async (tx) => {
    await tx.execute(sql`
      update "user"
      set "phoneNumber" = ${phone}, "updatedAt" = now()
      where id = ${session.user.id}
    `);
  });
  const viewer = await ensureViewer(
    {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phoneNumber: phone,
    },
    session.user.email,
  );
  if (viewer.phoneTaken) return { ok: false as const, message: PHONE_TAKEN_MESSAGE };
  return { ok: true as const, viewer };
}

export const completePhoneFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => (typeof value === "string" ? value : ""))
  .handler(async ({ data }) => completePhone(data));
