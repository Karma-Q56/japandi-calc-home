import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { getAuth } from "./auth";
import { withContext } from "./db";
import { isValidSAMobile, normalizePhone } from "@/lib/phone";

export type ViewerRole = "guest" | "owner" | "manager" | "operator";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  role: ViewerRole;
  restaurantId: string | null;
  customerId: string | null;
  needsPhone: boolean;
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
 * Link the signed-in auth user to our own rows. Owners and operators are
 * pre-created by hand (see docs/auth-setup.md); a new email is a guest and gets
 * a customer row the first time it signs in.
 */
export async function ensureViewer(user: AuthUser, email: string): Promise<Viewer> {
  const existing = await withContext(
    { databaseUrl: databaseUrl(), isOperator: true },
    async (transaction) => {
      const result = await transaction.execute<AppUserRow>(sql`
        select user_id, role, restaurant_id, customer_id
        from app_user
        where user_id = ${user.id} or email = ${email.toLowerCase()}
        limit 1
      `);
      return result.rows[0] ?? null;
    },
  );

  if (existing) {
    if (existing.user_id !== user.id) {
      await withContext({ databaseUrl: databaseUrl(), isOperator: true }, async (tx) => {
        await tx.execute(sql`
          update app_user set user_id = ${user.id}, updated_at = now()
          where user_id = ${existing.user_id}
        `);
      });
    }
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
      const customer = await transaction.execute<{ id: string }>(sql`
        insert into customer (user_id, phone_e164, name)
        values (${user.id}, ${phone}, ${user.name})
        on conflict (user_id) do update set name = excluded.name
        returning id
      `);
      const id = customer.rows[0]?.id;
      if (!id) throw new Error("Could not create the customer row.");
      await transaction.execute(sql`
        insert into app_user (user_id, email, role, customer_id, updated_at)
        values (${user.id}, ${email.toLowerCase()}, 'guest', ${id}, now())
        on conflict (user_id) do update
          set email = excluded.email, customer_id = excluded.customer_id, updated_at = now()
      `);
      return id;
    },
  );

  return {
    userId: user.id,
    email,
    name: user.name,
    role: "guest",
    restaurantId: null,
    customerId,
    needsPhone: false,
  };
}

/** The one place a route learns who is signed in. Returns null when signed out. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Viewer | null> => {
    const session = await getAuth().api.getSession({
      headers: getRequestHeaders(),
    });
    if (!session?.user?.email) return null;
    return ensureViewer(
      {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        phoneNumber: (session.user as { phoneNumber?: string | null }).phoneNumber,
      },
      session.user.email,
    );
  },
);

/** Finish a Google profile with the phone the guest wants on their card. */
export const completePhoneFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    const phone = typeof value === "string" ? value : "";
    return phone;
  })
  .handler(async ({ data: phoneInput }) => {
    const session = await getAuth().api.getSession({
      headers: getRequestHeaders(),
    });
    if (!session?.user?.email) {
      return { ok: false as const, message: "Sign in again to finish your details." };
    }
    const phone = normalizePhone(phoneInput);
    if (!phone || !isValidSAMobile(phone)) {
      return { ok: false as const, message: "Enter a valid South African mobile number." };
    }
    await getAuth().api.updateUser({
      headers: getRequestHeaders(),
      body: { phoneNumber: phone },
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
    return { ok: true as const, viewer };
  });
