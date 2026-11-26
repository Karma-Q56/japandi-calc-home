import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { withContext } from "./db";
import * as schema from "./auth-schema";

/**
 * Self-hosted Better Auth. Users and sessions live in the Neon dev branch, so
 * TanStack Start server functions on Workers can read the session from the
 * request cookies. No managed auth service is involved.
 */

type Auth = ReturnType<typeof betterAuth>;
type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Optional email seam. No provider secret lives in this repository. */
export async function sendAuthEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const url = process.env["AUTH_EMAIL_WEBHOOK_URL"];
  if (!url) {
    throw new Error("Email is not configured on this server yet.");
  }
  const secret = process.env["AUTH_EMAIL_WEBHOOK_SECRET"];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Could not send the email.");
}

/** Audit events go through the tenant-aware database helper, never a client. */
async function logAuthEvent(
  action: "sign_in" | "sign_in_failed" | "password_changed",
  actorId: string | null,
): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return;
  try {
    await withContext({ databaseUrl, isOperator: true }, async (transaction) => {
      await transaction.execute(sql`
        insert into audit_event (actor_type, actor_id, action, meta)
        values ('system', ${actorId}, ${action}, '{}'::jsonb)
      `);
    });
  } catch {
    // An audit write must never block a sign-in.
  }
}

/** The sign-in setup on a given database. Exported so tests run the real settings. */
export function createAuth(database: AuthDatabase): Auth {
  const secret = required("BETTER_AUTH_SECRET");
  const baseURL =
    process.env["BETTER_AUTH_URL"] ??
    process.env["APP_URL"] ??
    "http://localhost:5173";
  const googleId = process.env["GOOGLE_CLIENT_ID"];
  const googleSecret = process.env["GOOGLE_CLIENT_SECRET"];

  return betterAuth({
    appName: "Patron",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(database, { provider: "pg", schema }),
    user: {
      additionalFields: {
        phoneNumber: {
          type: "string",
          required: false,
          input: true,
          returned: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // A new password signs out every other device that was still logged in.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Reset your Patron password",
          text: `Use this link to choose a new password. It expires in one hour.\n\n${url}`,
        });
      },
      onPasswordReset: async ({ user }) => {
        await logAuthEvent("password_changed", user.id);
      },
    },
    socialProviders:
      googleId && googleSecret
        ? {
            google: {
              clientId: googleId,
              clientSecret: googleSecret,
              prompt: "select_account",
            },
          }
        : {},
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies:
        (process.env["APP_ENV"] ?? "").toLowerCase() === "production",
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (ctx.path === "/sign-in/email") {
          const failed = returned instanceof APIError || !ctx.context.newSession;
          await logAuthEvent(
            failed ? "sign_in_failed" : "sign_in",
            ctx.context.newSession?.user.id ?? null,
          );
        }
        if (ctx.path === "/change-password") {
          await logAuthEvent(
            "password_changed",
            ctx.context.session?.user.id ?? null,
          );
        }
      }),
    },
    plugins: [tanstackStartCookies()],
  }) as unknown as Auth;
}

/**
 * Run one piece of sign-in work with its own database connection, then close it. A Worker
 * may not reuse a connection that another request opened: doing so hangs the request.
 */
export async function withAuth<T>(work: (auth: Auth) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: required("DATABASE_URL"), max: 1 });
  try {
    return await work(createAuth(drizzle(pool, { schema })));
  } finally {
    await pool.end();
  }
}
