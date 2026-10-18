import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import type { AuditEvent } from "@/data/types";
import { failure, success } from "./demo";

export type AuditAction =
  | "sign_in"
  | "pin_failure"
  | "lockout"
  | "stamp"
  | "undo"
  | "redeem"
  | "pin_reset"
  | "pairing"
  | "phone_reveal"
  | "export"
  | "remove"
  | "manual_stamp"
  | "topup_request"
  | "topup_confirm"
  | "adjustment"
  | "campaign_confirm"
  | "campaign_settle"
  | "campaign_cancel"
  | "campaign_approve"
  | "sms_webhook";

/** Never pass PINs or full phone numbers — ids only. */
export function logAudit(input: {
  actor: string;
  action: AuditAction;
  restaurantId?: string;
  object?: string;
}) {
  const event: AuditEvent = {
    id: `audit-${crypto.randomUUID()}`,
    ...input,
    createdAt: new Date(clock.now()).toISOString(),
  };
  updateDemo((current) => ({ ...current, audit: [event, ...current.audit] }));
  return event;
}

export function listAudit(input: {
  restaurantId?: string | undefined;
  action?: AuditAction | undefined;
  limit?: number;
}) {
  const state = demoRepo.read();
  const events = state.audit
    .filter((event) => (input.restaurantId ? event.restaurantId === input.restaurantId : true))
    .filter((event) => (input.action ? event.action === input.action : true))
    .slice(0, input.limit ?? 100);
  return success(events);
}

export function requireScope(
  role: string,
  sessionRestaurantId: string | undefined,
  restaurantId: string,
) {
  if (role === "operator") return success(true);
  if ((role === "owner" || role === "staff") && sessionRestaurantId === restaurantId) {
    return success(true);
  }
  return failure("FORBIDDEN", "You do not have access to that restaurant.");
}
