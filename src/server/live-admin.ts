import { sql, type SQL } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode } from "./db/mode";
import {
  ADMIN_REFUSAL_CODES,
  ACTIVITY_PAGE_SIZE,
  adminErrorMessage,
  checkFeedback,
  checkCampaignNote,
  checkHelpDays,
  checkIdea,
  checkSettings,
  type SettingsInput,
} from "@/lib/live-admin";

// Live owner admin for phase D13a: settings, activity log, feedback and ideas.
// Demo mode never imports this file.
//
// SECURITY:
// - Each change or read is made by SQL functions (migration 0022) that look up the
//   caller's own restaurant and require owner or manager. The caller never sends a
//   restaurant id, role or plan.
// - Feedback and idea sending is rate limited per user (10 a day) in the SQL functions.

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

/** Read the short refusal code from the error chain by exact match (see live-onboarding). */
export function refusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message: string = current.message;
    const match = ADMIN_REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

function ownerOnly(viewer: Viewer | null): viewer is Viewer & { restaurantId: string } {
  return (
    !!viewer &&
    (viewer.role === "owner" || viewer.role === "manager") &&
    typeof viewer.restaurantId === "string"
  );
}

export type OwnerSettings = SettingsInput & { canEdit: boolean; helpOn: boolean };

/** The owner's settings. Null for anyone else or in demo mode. */
export async function getOwnerSettings(viewer: Viewer | null): Promise<OwnerSettings | null> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return null;
  const userId = viewer.userId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
    const rows = await q<{
      name: string;
      phone: string | null;
      address: string | null;
      suburb: string | null;
      city: string;
      enquiry_email: string | null;
      offers_alerts: boolean;
      orders_at_till: boolean;
      marketing_weekly_cap: number;
      member_weekly_cap: number;
      patron_help_enabled: boolean;
      patron_help_expires_at: Date | string | null;
    }>(
      tx,
      sql`
        select r.name, r.phone, r.address, r.suburb, r.city, r.enquiry_email,
               r.offers_alerts, r.orders_at_till, r.marketing_weekly_cap, r.member_weekly_cap,
               r.patron_help_enabled, r.patron_help_expires_at
        from restaurant r
        join app_user u on u.restaurant_id = r.id and u.user_id = ${userId}
        where r.id = ${viewer.restaurantId} limit 1
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      canEdit: viewer.role === "owner" || viewer.role === "manager",
      name: row.name,
      phone: row.phone ?? "",
      address: row.address ?? "",
      suburb: row.suburb ?? "",
      city: row.city,
      enquiryEmail: row.enquiry_email ?? "",
      offersAlerts: row.offers_alerts,
      ordersAtTill: row.orders_at_till,
      marketingWeeklyCap: Number(row.marketing_weekly_cap),
      memberWeeklyCap: Number(row.member_weekly_cap),
      helpOn: row.patron_help_enabled && row.patron_help_expires_at !== null && new Date(row.patron_help_expires_at).getTime() > Date.now(),
    };
  });
}

export type AdminResult<T = null> = { ok: true; value: T } | { ok: false; message: string; field?: string };

function refused(code: string | null, field?: string): { ok: false; message: string; field?: string } {
  return field === undefined ? { ok: false, message: adminErrorMessage(code) } : { ok: false, message: adminErrorMessage(code), field };
}

/** Save business details and preferences. Owner or manager only. */
export async function saveOwnerSettings(viewer: Viewer | null, input: SettingsInput): Promise<AdminResult> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return refused("not_allowed");
  const check = checkSettings(input);
  if (!check.ok) return { ok: false, message: check.message, field: check.field };
  const v = check.value;
  const userId = viewer.userId;
  try {
    await withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
      await q<unknown>(
        tx,
        sql`select save_owner_settings(${userId}, ${v.name}, ${v.phone || null}, ${v.address || null},
          ${v.suburb || null}, ${v.city}, ${v.enquiryEmail || null}, ${v.offersAlerts}, ${v.ordersAtTill},
          ${v.marketingWeeklyCap}, ${v.memberWeeklyCap})`,
      );
    });
    return { ok: true, value: null };
  } catch (error) {
    return refused(refusalCode(error));
  }
}

/** Turn Help from Patron on for 1, 7, 14 or 30 days, or off. Owner or manager only. */
export async function setOwnerHelp(viewer: Viewer | null, enabled: boolean, days: number): Promise<AdminResult> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return refused("not_allowed");
  if (enabled && !checkHelpDays(days)) return { ok: false, message: "Choose 1, 7, 14 or 30 days." };
  const userId = viewer.userId;
  try {
    await withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
      await q<unknown>(tx, sql`select set_owner_help(${userId}, ${enabled}, ${enabled ? days : null}::integer)`);
    });
    return { ok: true, value: null };
  } catch (error) {
    return refused(refusalCode(error));
  }
}

/** Ask Patron to run a done-for-you campaign. Saves a request only; nothing is sent. */
export async function requestOwnerCampaign(viewer: Viewer | null, note: string): Promise<AdminResult> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return refused("not_allowed");
  const check = checkCampaignNote(note);
  if (!check.ok) return { ok: false, message: check.message };
  const userId = viewer.userId;
  try {
    await withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
      await q<unknown>(tx, sql`select request_owner_campaign(${userId}, ${check.note})`);
    });
    return { ok: true, value: null };
  } catch (error) {
    return refused(refusalCode(error));
  }
}

export type OwnerFeedbackItem = { id: string; category: string; message: string; status: string; createdAt: string };

/** The owner's own feedback and the replies. Never the private operator note. */
export async function listOwnerFeedback(viewer: Viewer | null): Promise<OwnerFeedbackItem[]> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return [];
  const userId = viewer.userId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
    const rows = await q<{ id: string; category: string; message: string; status: string; created_at: Date | string }>(
      tx,
      sql`select id, category, message, status, created_at from list_owner_feedback(${userId})`,
    );
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      message: row.message,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  });
}

/** Send feedback. Rate limited to 10 a day in the database. */
export async function sendOwnerFeedback(viewer: Viewer | null, category: string, message: string): Promise<AdminResult> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return refused("not_allowed");
  const check = checkFeedback(category, message);
  if (!check.ok) return { ok: false, message: check.message };
  const userId = viewer.userId;
  const id = `fb-${crypto.randomUUID()}`;
  try {
    await withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
      await q<unknown>(tx, sql`select send_owner_feedback(${userId}, ${id}, ${check.category}, ${check.message})`);
    });
    return { ok: true, value: null };
  } catch (error) {
    return refused(refusalCode(error));
  }
}

export type OwnerIdeaBoardItem = { place: string; asks: number; latestAt: string };

/** The asks board for the owner's suburb: place and counts only. */
export async function listOwnerIdeas(viewer: Viewer | null): Promise<OwnerIdeaBoardItem[]> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return [];
  const userId = viewer.userId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
    const rows = await q<{ place: string; asks: number | string; latest_at: Date | string }>(
      tx,
      sql`select place, asks, latest_at from list_owner_ideas(${userId})`,
    );
    return rows.map((row) => ({
      place: row.place,
      asks: Number(row.asks),
      latestAt: new Date(row.latest_at).toISOString(),
    }));
  });
}

/** Ask for a place in the owner's suburb. Adds one ask, or counts up an existing one. */
export async function submitOwnerIdea(viewer: Viewer | null, place: string, note: string): Promise<AdminResult<number>> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return refused("not_allowed");
  const check = checkIdea(place, note);
  if (!check.ok) return { ok: false, message: check.message };
  const userId = viewer.userId;
  try {
    const asks = await withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
      const rows = await q<{ submit_owner_idea: number }>(
        tx,
        sql`select submit_owner_idea(${userId}, ${check.place}, ${check.note}) as submit_owner_idea`,
      );
      return Number(rows[0]?.submit_owner_idea ?? 0);
    });
    return { ok: true, value: asks };
  } catch (error) {
    return refused(refusalCode(error));
  }
}

export type OwnerActivityItem = { id: string; action: string; actorType: string; createdAt: string };

/** One page of this restaurant's activity, newest first. Pass the last `createdAt` to get the next page. */
export async function listOwnerActivity(viewer: Viewer | null, before: string | null): Promise<OwnerActivityItem[]> {
  if (getDataMode() !== "live" || !ownerOnly(viewer)) return [];
  const userId = viewer.userId;
  return withContext({ databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false }, async (tx) => {
    const rows = await q<{ id: string; action: string; actor_type: string; created_at: Date | string }>(
      tx,
      sql`select id, action, actor_type, created_at from list_owner_activity(${userId}, ${before}::timestamptz)`,
    );
    return rows.slice(0, ACTIVITY_PAGE_SIZE).map((row) => ({
      id: String(row.id),
      action: row.action,
      actorType: row.actor_type,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  });
}
