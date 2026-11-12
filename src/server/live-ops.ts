import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext, type DatabaseTransaction } from "./db";
import { getDataMode, requireDatabaseUrl } from "./db/mode";

// Live operator console for phase D18. Demo mode never imports this file.
//
// SECURITY:
// - Only a viewer whose role is 'operator' (from the server session) may call these.
// - The database functions (0029) check the operator role again. The browser never sends a role.
// - Every write goes through a SECURITY DEFINER function that writes an audit_event row.
// - Money (credit) and switches (pause, close) need a note and, in the UI, a confirmation.

export type OpsResult = { ok: true; message?: string } | { ok: false; message: string };

const DATA_MODE_ERROR = "Live operator tools need live mode.";

/** Map a database refusal code to plain words. Read the code from the cause chain, never the message. */
export function refusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      const match = /\b(not_operator|restaurant_not_found|campaign_not_found|bad_[a-z_]+|same_status|same_plan|not_pending|slug_taken|slug_reserved|duplicate|plan_limit_locations|payment_not_found|amount_mismatch|invoice_not_found|already_paid)\b/.exec(
        current.message,
      );
      // Only the bare refusal raised by the function (the whole message) counts.
      if (match && current.message.trim() === match[1]) return match[1]!;
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return null;
}

export const OPS_MESSAGES: Record<string, string> = {
  not_operator: "Only Patron staff can do this.",
  restaurant_not_found: "That restaurant was not found.",
  campaign_not_found: "That campaign was not found.",
  same_status: "The restaurant already has that status.",
  same_plan: "The restaurant is already on that plan.",
  not_pending: "That campaign is no longer waiting for approval.",
  slug_taken: "That web address is already in use.",
  slug_reserved: "That web address is reserved. Try another.",
  bad_status: "Choose a valid status.",
  bad_plan: "Choose a valid plan.",
  bad_reason: "Write a short reason (3 to 200 characters).",
  bad_reference: "The reference must be 8 to 80 characters.",
  bad_amount: "Enter an amount in rands above zero (up to R100 000).",
  bad_entry_type: "Choose top up or adjustment.",
  bad_decision: "Choose approve or reject.",
  bad_email: "Enter a valid owner email.",
  bad_name: "Enter a name between 2 and 80 characters.",
  bad_slug: "The web address may use lowercase letters, numbers and single dashes.",
  bad_location: "The suburb or city is too long.",
  duplicate: "This credit was already added. Nothing changed.",
};

export function messageForRefusal(code: string | null): string {
  if (code && OPS_MESSAGES[code]) return OPS_MESSAGES[code]!;
  return "Something went wrong. Nothing changed. Try again.";
}

/** Rands to whole cents. Returns null when the value is not a plain amount. */
export function randsToCents(input: string): number | null {
  const clean = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Whole cents as rands with two decimals and a space thousands separator, e.g. R1 250.50. */
export function centsToRands(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const rands = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${sign}R${rands}.${remainder}`;
}

type Failure = { ok: false; message: string };
function requireOperator(viewer: Viewer | null): Failure | null {
  if (!viewer || viewer.role !== "operator") return { ok: false, message: messageForRefusal("not_operator") };
  if (getDataMode() !== "live") return { ok: false, message: DATA_MODE_ERROR };
  return null;
}

/** Run one database function as an operator and map any refusal to plain words. */
async function runAsOperator<T extends { ok: boolean }>(
  work: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T | OpsResult> {
  try {
    return await withContext({ databaseUrl: requireDatabaseUrl(), isOperator: true }, work);
  } catch (error) {
    return { ok: false, message: messageForRefusal(refusalCode(error)) };
  }
}

type Row = Record<string, unknown>;
const rowsOf = (res: unknown): Row[] => ((res as { rows?: Row[] }).rows ?? []);

export async function setRestaurantStatus(viewer: Viewer, restaurantId: string, status: string, reason: string): Promise<OpsResult> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_set_restaurant_status(${viewer.userId}, ${restaurantId}::uuid, ${status}::restaurant_status, ${reason})`);
    return { ok: true as const, message: `Status changed to ${status}.` };
  });
  return result as OpsResult;
}

export async function setRestaurantPlan(viewer: Viewer, restaurantId: string, plan: string, reason: string): Promise<OpsResult> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_set_restaurant_plan(${viewer.userId}, ${restaurantId}::uuid, ${plan}::plan_tier, ${reason})`);
    return { ok: true as const, message: `Plan changed to ${plan}.` };
  });
  return result as OpsResult;
}

/** Add credit (topup) or correct it (adjustment). The reference stops a double click adding twice. */
export async function addCredit(
  viewer: Viewer,
  input: { restaurantId: string; entryType: "topup" | "adjustment"; amountCents: number; reference: string; reason: string },
): Promise<OpsResult> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_add_credit(${viewer.userId}, ${input.restaurantId}::uuid, ${input.entryType}::ledger_entry_type, ${input.amountCents}, ${input.reference}, ${input.reason}) as id`,
    );
    const id = String(rowsOf(res)[0]?.["id"] ?? "");
    if (id === "duplicate") return { ok: true as const, message: messageForRefusal("duplicate") };
    return { ok: true as const, message: "Credit added." };
  });
  return result as OpsResult;
}

/** Approve a pending campaign, or reject it with a reason. */
export async function decideCampaign(viewer: Viewer, campaignId: string, decision: "approve" | "reject", reason: string): Promise<OpsResult> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    await tx.execute(sql`select operator_decide_campaign(${viewer.userId}, ${campaignId}::uuid, ${decision}, ${reason})`);
    return { ok: true as const, message: decision === "approve" ? "Campaign approved." : "Campaign rejected." };
  });
  return result as OpsResult;
}

/** Create a draft restaurant for an owner by email. The owner claims it on sign up. */
export async function createRestaurantForOwner(
  viewer: Viewer,
  input: { ownerEmail: string; name: string; slug: string; suburb: string; city: string },
): Promise<{ ok: true; restaurantId: string } | { ok: false; message: string }> {
  const denied = requireOperator(viewer);
  if (denied) return denied;
  const result = await runAsOperator(async (tx) => {
    const res = await tx.execute(
      sql`select operator_create_restaurant(${viewer.userId}, ${input.ownerEmail}, ${input.name}, ${input.slug}, ${input.suburb}, ${input.city}) as id`,
    );
    return { ok: true as const, restaurantId: String(rowsOf(res)[0]?.["id"] ?? "") };
  });
  if (!result.ok) return result;
  if (!("restaurantId" in result)) return { ok: false, message: "Something went wrong. Try again." };
  return { ok: true, restaurantId: result.restaurantId };
}
