import { QUIET_HOURS } from "@/config/app";
import { demoRepo, updateDemo } from "@/data/repo";
import type {
  Campaign,
  CampaignAudience,
  CampaignStatus,
  DemoState,
  LedgerEntry,
  Membership,
  Message,
} from "@/data/types";
import { countSegments, sanitizeForGsm7 } from "@/lib/segments";
import { logAudit } from "./audit";
import { segmentMemberships } from "./audiences";
import { balanceFor, planEntries, type NewEntry } from "./credit";
import { failure, success } from "./demo";
import { issueTargetedCodes } from "./specials";

export const COST_PER_SEGMENT_CENTS = 35;
export const STOP_FOOTER = "\nReply STOP to opt out.";
export const DISPATCH_BATCH = 25;
export const MAX_ATTEMPTS = 3;
export const VISITS_LABEL = "Visits by recipients after sending; not proof the message caused them.";

const DAY = 86400000;
/** SAST has no daylight saving, so 08:00 SAST is always 06:00 UTC. */
const SAST_OFFSET = 2 * 3600000;

export function joburgHour(epochMs: number): number {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(epochMs));
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
}

export function inQuietHours(epochMs: number): boolean {
  const hour = joburgHour(epochMs);
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
}

export function nextEightAm(epochMs: number): number {
  const dayStart = Math.floor((epochMs + SAST_OFFSET) / DAY) * DAY;
  const eightAmUtc = dayStart + 6 * 3600000;
  return eightAmUtc <= epochMs ? eightAmUtc + DAY : eightAmUtc;
}

/* ---------------------------------------------------------------- audience */

function memberReceivedCount(state: DemoState, membership: Membership, now: number): number {
  return state.messages.filter((message) => {
    const mine =
      message.membershipId === membership.id ||
      (message.customerId === membership.customerId &&
        message.restaurantId === membership.restaurantId);
    if (!mine || message.channel !== "sms" || (message.status !== "sent" && message.status !== "delivered")) return false;
    const at = message.sentAt ?? message.createdAt;
    return now - new Date(at).getTime() < 7 * DAY;
  }).length;
}

/** Opted-in SMS, not erased, under the member weekly cap, inside the segment. */
export function eligibleMemberships(
  state: DemoState,
  restaurantId: string,
  audience: CampaignAudience,
  now = state.now,
): Membership[] {
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  const cap = restaurant?.smsCapMember ?? 2;
  return segmentMemberships(state, restaurantId, audience).filter((membership) => {
    if (!membership.marketingSms) return false;
    const customer = state.customers.find((c) => c.id === membership.customerId);
    if (!customer || customer.deleted) return false;
    if (memberReceivedCount(state, membership, now) >= cap) return false;
    return true;
  });
}

/** Guests with an opted-in browser subscription, scoped to this restaurant. */
export function eligiblePushMemberships(
  state: DemoState,
  restaurantId: string,
  audience: CampaignAudience,
): Membership[] {
  return segmentMemberships(state, restaurantId, audience).filter((membership) => {
    if (!membership.marketingPush) return false;
    const customer = state.customers.find((item) => item.id === membership.customerId);
    if (!customer || customer.deleted) return false;
    return state.pushSubscriptions.some((subscription) =>
      (subscription.membershipId === membership.id || subscription.customerId === membership.customerId) &&
      (!subscription.restaurantId || subscription.restaurantId === restaurantId),
    );
  });
}

/* -------------------------------------------------------------------- copy */

export function renderBody(template: string, firstName: string): string {
  return template.replaceAll("{first_name}", firstName);
}

export function fullBody(template: string, firstName: string): string {
  return `${renderBody(template, firstName)}${STOP_FOOTER}`;
}

export function messageSegments(template: string, firstName: string): number {
  return Math.max(1, countSegments(fullBody(template, firstName)));
}

export interface CopyWarning {
  kind: "smart-quotes" | "unicode";
  message: string;
  fixable: boolean;
}

export function checkCopy(body: string): CopyWarning[] {
  const warnings: CopyWarning[] = [];
  const { modified } = sanitizeForGsm7(body);
  if (modified) {
    warnings.push({
      kind: "smart-quotes",
      message: "Smart quotes or dashes raise the segment count. One-click fix available.",
      fixable: true,
    });
  }
  const rest = sanitizeForGsm7(body).text;
  if (/[^\u0020-\u007E\n\r\t]/.test(rest)) {
    warnings.push({
      kind: "unicode",
      message: "Emoji or symbols switch the whole message to Unicode (70 chars per segment).",
      fixable: false,
    });
  }
  return warnings;
}

export function fixCopy(body: string): string {
  return sanitizeForGsm7(body).text;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeOfferCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]!;
    if (!taken.has(code)) return code;
  }
  return `OFFER${String(Date.now()).slice(-4)}`;
}

export function validOfferCode(code: string): boolean {
  return /^[A-Z0-9]{3,12}$/.test(code);
}

export function costPreview(input: {
  recipients: number;
  segments: number;
  creditCents: number;
}): string {
  const total = input.recipients * input.segments * COST_PER_SEGMENT_CENTS;
  const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;
  return (
    `${input.recipients} guests x ${input.segments} segment${input.segments === 1 ? "" : "s"}` +
    ` x ${zar(COST_PER_SEGMENT_CENTS)} = ${zar(total)}, your credit ${zar(input.creditCents)}`
  );
}

/* ------------------------------------------------------------------ drafts */

export function saveDraft(input: {
  restaurantId: string;
  actor: string;
  actorRole: string;
  draftId?: string;
  fields: {
    name: string;
    body: string;
    audience: CampaignAudience;
    code?: string;
    validFrom?: string;
    validTo?: string;
    specialId?: string;
    channel?: Campaign["channel"];
  };
}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((r) => r.id === input.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  const name = input.fields.name.trim();
  const body = input.fields.body.trim();
  if (!name) return failure("INVALID", "Give the campaign a name.");
  if (body.length < 1 || body.length > 600) {
    return failure("INVALID", "Messages are 1 to 600 characters.");
  }
  const taken = new Set(
    state.campaigns
      .filter((c) => c.restaurantId === input.restaurantId && c.id !== input.draftId)
      .map((c) => c.code),
  );
  const code = (input.fields.code ?? "").trim().toUpperCase() || makeOfferCode(taken);
  if (!validOfferCode(code)) return failure("INVALID", "Offer codes are 3 to 12 A-Z/0-9 characters.");
  if (taken.has(code)) return failure("INVALID", "That offer code is already used here.");
  if (input.fields.specialId) {
    const special = state.specials.find(
      (item) => item.id === input.fields.specialId && item.restaurantId === input.restaurantId,
    );
    if (!special) return failure("INVALID", "Choose a special from this restaurant.");
  }
  const requiresApproval = input.actorRole === "operator";
  if (!input.draftId) {
    const now = new Date(state.now).toISOString();
    const campaign: Campaign = {
      id: `campaign-${crypto.randomUUID()}`,
      restaurantId: input.restaurantId,
      name,
      body,
      channel: input.fields.channel ?? "sms",
      audience: input.fields.audience,
      code,
      ...(input.fields.specialId ? { specialId: input.fields.specialId } : {}),
      ...(input.fields.validFrom ? { validFrom: input.fields.validFrom } : {}),
      ...(input.fields.validTo ? { validTo: input.fields.validTo } : {}),
      status: "draft",
      requiresApproval,
      sentAt: null,
      recipients: 0,
      delivered: 0,
      failed: 0,
      createdBy: input.actor,
      createdAt: now,
      actualCostCents: 0,
    };
    updateDemo((current) => ({ ...current, campaigns: [...current.campaigns, campaign] }));
    return success(campaign);
  }
  const existing = state.campaigns.find((c) => c.id === input.draftId);
  if (!existing || existing.status !== "draft") {
    return failure("INVALID", "Only drafts can be edited.");
  }
  let updated: Campaign = {
    ...existing,
    name,
    body,
    audience: input.fields.audience,
    channel: input.fields.channel ?? existing.channel ?? "sms",
    code,
    ...(input.fields.specialId ? { specialId: input.fields.specialId } : {}),
  };
  if (input.fields.validFrom) updated = { ...updated, validFrom: input.fields.validFrom };
  if (input.fields.validTo) updated = { ...updated, validTo: input.fields.validTo };
  updateDemo((current) => ({
    ...current,
    campaigns: current.campaigns.map((c) => (c.id === updated.id ? updated : c)),
  }));
  return success(updated);
}

export function approveCampaign(input: { campaignId: string; actor: string; role: string }) {
  if (input.role !== "owner" && input.role !== "manager" && input.role !== "operator") {
    return failure("FORBIDDEN", "Only owners and managers approve campaigns.");
  }
  const state = demoRepo.read();
  const campaign = state.campaigns.find((c) => c.id === input.campaignId);
  if (!campaign) return failure("NOT_FOUND", "Campaign not found.");
  const now = new Date(state.now).toISOString();
  updateDemo((current) => ({
    ...current,
    campaigns: current.campaigns.map((c) =>
      c.id === campaign.id ? { ...c, approvedBy: input.actor, approvedAt: now } : c,
    ),
  }));
  logAudit({
    actor: input.actor,
    action: "campaign_approve",
    restaurantId: campaign.restaurantId,
    object: campaign.id,
  });
  return success(true);
}

/* ----------------------------------------------------------------- confirm */

/**
 * Confirm a draft: recompute the audience, check credit, and write the
 * reservation plus one message row per eligible membership in a single
 * repo update. Unique per campaign + membership + channel.
 */
export function confirmCampaign(input: {
  campaignId: string;
  actor: string;
  sendNow?: boolean;
  scheduledAt?: string;
}) {
  const state = demoRepo.read();
  const campaign = state.campaigns.find((c) => c.id === input.campaignId);
  if (!campaign) return failure("NOT_FOUND", "Campaign not found.");
  if (campaign.status !== "draft") return failure("INVALID", "Only drafts can be confirmed.");
  if (campaign.requiresApproval && !campaign.approvedBy) {
    return failure("INVALID", "An owner or manager must approve this campaign first.");
  }
  const pushEligible = campaign.channel === "sms"
    ? []
    : eligiblePushMemberships(state, campaign.restaurantId, campaign.audience);
  const pushMembershipIds = new Set(pushEligible.map((membership) => membership.id));
  const smsEligible = campaign.channel === "push"
    ? []
    : eligibleMemberships(state, campaign.restaurantId, campaign.audience, state.now)
        .filter((membership) => campaign.channel !== "push_then_sms" || !pushMembershipIds.has(membership.id));
  const eligible = [...pushEligible, ...smsEligible];
  if (eligible.length === 0) {
    return failure("INVALID", "No eligible guests for the selected channel: check consent and device subscriptions.");
  }
  const special = campaign.specialId
    ? state.specials.find((item) => item.id === campaign.specialId)
    : undefined;
  const codeByMembership = new Map<string, string>();
  if (special?.kind === "targeted") {
    issueTargetedCodes(
      special.id,
      eligible.map((membership) => membership.id),
    );
    for (const issued of demoRepo.read().specialCodes) {
      if (issued.specialId === special.id) {
        codeByMembership.set(issued.membershipId, issued.code);
      }
    }
  }
  const sample = state.memberships.find((m) => m.id === (smsEligible[0] ?? eligible[0])?.id);
  const sampleName = sample
    ? (state.customers.find((c) => c.id === sample.customerId)?.name.split(" ")[0] ?? "friend")
    : "friend";
  const sampleCode = codeByMembership.get(eligible[0]?.id ?? "");
  const segments = messageSegments(
    sampleCode ? `${campaign.body}\nYour code: ${sampleCode}` : campaign.body,
    sampleName,
  );
  const estCost = smsEligible.length * segments * COST_PER_SEGMENT_CENTS;
  const balance = balanceFor(state, campaign.restaurantId);
  if (estCost > balance) {
    return failure(
      "INVALID",
      `Insufficient credit: this send needs R${(estCost / 100).toFixed(2)} but the balance is R${(balance / 100).toFixed(2)}. Top up first.`,
    );
  }
  const planned = estCost > 0 ? planEntries(state, campaign.restaurantId, [
    {
      type: "reserve",
      amountCents: -estCost,
      reference: `reserve:${campaign.id}`,
      campaignId: campaign.id,
      createdBy: input.actor,
    },
  ]) : { ok: true as const, entries: [] as LedgerEntry[] };
  if (!planned.ok) return failure("INVALID", planned.reason);
  let scheduledAt = input.scheduledAt;
  if (scheduledAt && inQuietHours(Date.parse(scheduledAt))) {
    scheduledAt = new Date(nextEightAm(Date.parse(scheduledAt))).toISOString();
  }
  const now = new Date(state.now).toISOString();
  const status: CampaignStatus =
    input.sendNow || !scheduledAt ? "sending" : "scheduled";
  const existingKeys = new Set(
    state.messages
      .filter((message) => message.campaignId === campaign.id)
      .map((message) => `${message.membershipId}:${message.channel}`),
  );
  const created: Message[] = [];
  for (const membership of pushEligible) {
    if (existingKeys.has(`${membership.id}:push`)) continue;
    const customer = state.customers.find((item) => item.id === membership.customerId)!;
    created.push({
      id: `message-${crypto.randomUUID()}`,
      restaurantId: campaign.restaurantId,
      customerId: membership.customerId,
      membershipId: membership.id,
      campaignId: campaign.id,
      channel: "push",
      body: renderBody(campaign.body, customer.name.split(" ")[0] ?? customer.name),
      segments: 0,
      costCents: 0,
      status: "queued",
      attempts: 0,
      provider: "demo-outbox",
      createdAt: now,
    });
  }
  for (const membership of smsEligible) {
    if (existingKeys.has(`${membership.id}:sms`)) continue;
    const customer = state.customers.find((c) => c.id === membership.customerId)!;
    const firstName = customer.name.split(" ")[0] ?? customer.name;
    const personalCode = codeByMembership.get(membership.id);
    const body = `${renderBody(campaign.body, firstName)}${
      personalCode ? `\nYour code: ${personalCode}` : ""
    }`;
    created.push({
      id: `message-${crypto.randomUUID()}`,
      restaurantId: campaign.restaurantId,
      customerId: membership.customerId,
      membershipId: membership.id,
      campaignId: campaign.id,
      channel: "sms",
      body,
      segments: Math.max(1, countSegments(`${body}${STOP_FOOTER}`)),
      costCents: Math.max(1, countSegments(`${body}${STOP_FOOTER}`)) * COST_PER_SEGMENT_CENTS,
      status: "queued",
      attempts: 0,
      provider: "fake",
      createdAt: now,
    });
  }
  updateDemo((current) => {
    const ledger = [...current.ledger, ...planned.entries];
    const balanceAfter = ledger
      .filter((entry) => entry.restaurantId === campaign.restaurantId)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return {
      ...current,
      ledger,
      messages: [...current.messages, ...created],
      campaigns: current.campaigns.map((c) =>
        c.id === campaign.id
          ? {
              ...c,
              status,
              ...(scheduledAt ? { scheduledAt } : {}),
              ...(status === "sending" ? { sentAt: now } : {}),
              recipients: created.length,
              estRecipients: eligible.length,
              estSegments: segments,
              estCostCents: estCost,
            }
          : c,
      ),
      restaurants: current.restaurants.map((restaurant) =>
        restaurant.id === campaign.restaurantId
          ? { ...restaurant, creditCents: balanceAfter }
          : restaurant,
      ),
    };
  });
  logAudit({
    actor: input.actor,
    action: "campaign_confirm",
    restaurantId: campaign.restaurantId,
    object: campaign.id,
  });
  return success({ recipients: created.length, estCostCents: estCost, segments });
}

/* ---------------------------------------------------------------- dispatch */

export interface DispatchReport {
  sent: number;
  skipped: number;
  held: number;
  failed: number;
}

/**
 * Pure dispatcher over a state snapshot: claims queued messages in small
 * batches and re-checks consent, erasure, quiet hours and caps per message.
 * Claiming flips queued -> sending inside the returned state, so killing the
 * run mid-batch and restarting never sends twice.
 */
export function dispatchBatch(
  state: DemoState,
  nowMs: number,
  opts?: { limit?: number; send?: (message: Message) => "sent" | "failed" },
): { state: DemoState; report: DispatchReport } {
  const limit = opts?.limit ?? DISPATCH_BATCH;
  const send = opts?.send ?? (() => "sent" as const);
  const now = new Date(nowMs).toISOString();
  const report: DispatchReport = { sent: 0, skipped: 0, held: 0, failed: 0 };
  let next: DemoState = state;

  const dueCampaigns = next.campaigns.map((campaign) => {
    if (campaign.status === "scheduled" && campaign.scheduledAt && Date.parse(campaign.scheduledAt) <= nowMs) {
      return { ...campaign, status: "sending" as CampaignStatus, sentAt: campaign.sentAt ?? now };
    }
    return campaign;
  });
  next = { ...next, campaigns: dueCampaigns };

  const broadcasts = (restaurantId: string) =>
    new Set(
      next.messages
        .filter(
          (message) =>
            message.restaurantId === restaurantId &&
            message.campaignId &&
            (message.status === "sent" || message.status === "delivered") &&
            nowMs - new Date(message.sentAt ?? message.createdAt).getTime() < 7 * DAY,
        )
        .map((message) => message.campaignId),
    ).size;

  const claimable = next.messages
    .filter(
      (message) =>
        message.status === "queued" &&
        message.campaignId &&
        (!message.notBefore || Date.parse(message.notBefore) <= nowMs),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
    .map((message) => message.id);
  const claimed = new Set(claimable);

  const messages: Message[] = next.messages.map((message): Message => {
    if (!claimed.has(message.id)) return message;
    const campaign = next.campaigns.find((c) => c.id === message.campaignId);
    const restaurant = next.restaurants.find((r) => r.id === message.restaurantId);
    const membership = next.memberships.find((m) => m.id === message.membershipId);
    const customer = membership && next.customers.find((c) => c.id === membership.customerId);
    const skip = (errorCode: string): Message => {
      report.skipped += 1;
      return { ...message, status: "skipped", errorCode };
    };
    if (!campaign || !restaurant || !membership || !customer) return skip("missing_target");
    if (customer.deleted) return skip("erased");
    if (message.channel === "push") {
      if (!membership.marketingPush) return skip("push_consent_withdrawn");
      const subscribed = next.pushSubscriptions.some((subscription) =>
        (subscription.membershipId === membership.id || subscription.customerId === membership.customerId) &&
        (!subscription.restaurantId || subscription.restaurantId === restaurant.id),
      );
      if (!subscribed) return skip("push_subscription_missing");
    } else {
      if (!membership.marketingSms) return skip("consent_withdrawn");
      if (memberReceivedCount(next, membership, nowMs) >= (restaurant.smsCapMember ?? 2)) {
        return skip("member_cap");
      }
      if (broadcasts(restaurant.id) >= (restaurant.smsCapRestaurant ?? 3)) {
        return skip("restaurant_cap");
      }
    }
    if (inQuietHours(nowMs)) {
      report.held += 1;
      return { ...message, notBefore: new Date(nextEightAm(nowMs)).toISOString() };
    }
    if (send(message) === "failed") {
      const attempts = message.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        report.failed += 1;
        return { ...message, attempts, status: "failed", errorCode: "send_failed" };
      }
      report.held += 1;
      return {
        ...message,
        attempts,
        notBefore: new Date(nowMs + 5 * 60000 * 2 ** (attempts - 1)).toISOString(),
      };
    }
    report.sent += 1;
    return {
      ...message,
      status: "sent" as const,
      attempts: message.attempts + 1,
      sentAt: now,
      providerMessageId: `fake-${message.id}-a${message.attempts + 1}`,
    };
  });

  next = { ...next, messages };
  return { state: next, report };
}

/** Demo entry point: run the dispatcher against the live repo clock. */
export function runDispatcher(limit?: number): DispatchReport {
  const state = demoRepo.read();
  const { state: next, report } = dispatchBatch(
    state,
    state.now,
    limit === undefined ? undefined : { limit },
  );
  demoRepo.write(next);
  return report;
}

/* ----------------------------------------------------------------- settle */

/** Settle a finished campaign: release the reservation, charge the actual cost. */
export function settleCampaign(input: { campaignId: string; actor: string }) {
  const state = demoRepo.read();
  const campaign = state.campaigns.find((c) => c.id === input.campaignId);
  if (!campaign) return failure("NOT_FOUND", "Campaign not found.");
  if (campaign.status !== "sending" && campaign.status !== "scheduled") {
    return failure("INVALID", "Only campaigns being sent can settle.");
  }
  const rows = state.messages.filter((message) => message.campaignId === campaign.id);
  if (rows.some((message) => message.status === "queued" || message.status === "sending")) {
    return failure("INVALID", "Messages are still in flight.");
  }
  const actual = rows
    .filter((message) => message.channel === "sms" && (message.status === "sent" || message.status === "delivered"))
    .reduce((sum, message) => sum + message.costCents, 0);
  const batch: NewEntry[] = [
    {
      type: "release",
      amountCents: campaign.estCostCents ?? 0,
      reference: `release:${campaign.id}`,
      campaignId: campaign.id,
      createdBy: input.actor,
    },
  ];
  if (actual > 0) {
    batch.push({
      type: "charge",
      amountCents: -actual,
      reference: `charge:${campaign.id}`,
      campaignId: campaign.id,
      createdBy: input.actor,
    });
  }
  const validated = batch.some((entry) => entry.amountCents !== 0)
    ? planEntries(state, campaign.restaurantId, batch.filter((entry) => entry.amountCents !== 0))
    : { ok: true as const, entries: [] as LedgerEntry[] };
  if (!validated.ok) return failure("INVALID", validated.reason);
  const failed = rows.filter((m) => m.status === "failed").length;
  const delivered = rows.filter((m) => m.status === "delivered").length;
  updateDemo((current) => {
    const ledger = [...current.ledger, ...validated.entries];
    const balanceAfter = ledger
      .filter((entry) => entry.restaurantId === campaign.restaurantId)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return {
      ...current,
      ledger,
      campaigns: current.campaigns.map((c) =>
        c.id === campaign.id
          ? {
              ...c,
              status: "sent" as CampaignStatus,
              recipients: rows.length,
              delivered,
              failed,
              actualCostCents: actual,
            }
          : c,
      ),
      restaurants: current.restaurants.map((restaurant) =>
        restaurant.id === campaign.restaurantId
          ? { ...restaurant, creditCents: balanceAfter }
          : restaurant,
      ),
    };
  });
  logAudit({
    actor: input.actor,
    action: "campaign_settle",
    restaurantId: campaign.restaurantId,
    object: campaign.id,
  });
  return success({ actualCostCents: actual, messages: rows.length });
}

export function cancelCampaign(input: { campaignId: string; actor: string }) {
  const state = demoRepo.read();
  const campaign = state.campaigns.find((c) => c.id === input.campaignId);
  if (!campaign) return failure("NOT_FOUND", "Campaign not found.");
  if (campaign.status !== "scheduled" && campaign.status !== "sending") {
    return failure("INVALID", "Only scheduled or sending campaigns can be cancelled.");
  }
  const releaseBatch: NewEntry[] = [
    {
      type: "release" as const,
      amountCents: campaign.estCostCents ?? 0,
      reference: `release:${campaign.id}`,
      campaignId: campaign.id,
      createdBy: input.actor,
    },
  ].filter((entry) => entry.amountCents !== 0);
  const validated = planEntries(state, campaign.restaurantId, releaseBatch);
  if (!validated.ok) return failure("INVALID", validated.reason);
  updateDemo((current) => {
    const ledger = [...current.ledger, ...validated.entries];
    const balanceAfter = ledger
      .filter((entry) => entry.restaurantId === campaign.restaurantId)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return {
      ...current,
      ledger,
      messages: current.messages.map((message) =>
        message.campaignId === campaign.id && message.status === "queued"
          ? { ...message, status: "skipped" as const, errorCode: "cancelled" }
          : message,
      ),
      campaigns: current.campaigns.map((c) =>
        c.id === campaign.id ? { ...c, status: "cancelled" as CampaignStatus } : c,
      ),
      restaurants: current.restaurants.map((restaurant) =>
        restaurant.id === campaign.restaurantId
          ? { ...restaurant, creditCents: balanceAfter }
          : restaurant,
      ),
    };
  });
  logAudit({
    actor: input.actor,
    action: "campaign_cancel",
    restaurantId: campaign.restaurantId,
    object: campaign.id,
  });
  return success(true);
}

/** Refund a failed message that was already charged (reference refund:<message id>). */
export function refundMessage(input: { messageId: string; actor: string }) {
  const state = demoRepo.read();
  const message = state.messages.find((m) => m.id === input.messageId);
  if (!message || !message.campaignId) return failure("NOT_FOUND", "Message not found.");
  if (message.status !== "failed") return failure("INVALID", "Only failed messages are refunded.");
  const campaign = state.campaigns.find((c) => c.id === message.campaignId);
  if (!campaign || campaign.status !== "sent") {
    return failure("INVALID", "Refunds happen after settlement.");
  }
  const refundBatch: NewEntry[] = [
    {
      type: "refund" as const,
      amountCents: message.costCents,
      reference: `refund:${message.id}`,
      campaignId: message.campaignId,
      messageId: message.id,
      createdBy: input.actor,
    },
  ];
  const validated = planEntries(state, message.restaurantId, refundBatch);
  if (!validated.ok) return failure("INVALID", validated.reason);
  updateDemo((current) => {
    const ledger = [...current.ledger, ...validated.entries];
    const balanceAfter = ledger
      .filter((entry) => entry.restaurantId === message.restaurantId)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return {
      ...current,
      ledger,
      restaurants: current.restaurants.map((restaurant) =>
        restaurant.id === message.restaurantId
          ? { ...restaurant, creditCents: balanceAfter }
          : restaurant,
      ),
    };
  });
  return success(validated.entries[0]!);
}

/* ----------------------------------------------------------------- results */

export interface CampaignResults {
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  redemptions: number;
  redemptionRate: number;
  costCents: number;
  attributableVisits: number;
  visitsLabel: string;
}

export function campaignResults(state: DemoState, campaignId: string): CampaignResults | null {
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return null;
  const rows = state.messages.filter((message) => message.campaignId === campaignId);
  const count = (status: Message["status"]) => rows.filter((m) => m.status === status).length;
  const sent = count("sent") + count("delivered");
  const recipientIds = new Set(rows.map((m) => m.membershipId));
  const redemptions =
    state.redemptions.filter((r) => r.kind === "campaign" && r.rewardId === campaignId).length +
    (campaign.specialId
      ? state.redemptions.filter(
          (r) =>
            r.kind === "special" &&
            r.specialId === campaign.specialId &&
            recipientIds.has(r.membershipId),
        ).length
      : 0);
  const sentAt = campaign.sentAt ? Date.parse(campaign.sentAt) : null;
  const attributableVisits =
    sentAt === null
      ? 0
      : state.stamps.filter(
          (stamp) =>
            stamp.status === "valid" &&
            stamp.membershipId !== undefined &&
            recipientIds.has(stamp.membershipId) &&
            Date.parse(stamp.createdAt) > sentAt,
        ).length;
  return {
    queued: count("queued") + count("sending"),
    sent,
    delivered: count("delivered"),
    failed: count("failed"),
    skipped: count("skipped"),
    redemptions,
    redemptionRate: sent === 0 ? 0 : redemptions / sent,
    costCents: campaign.status === "sent" ? campaign.actualCostCents : (campaign.estCostCents ?? 0),
    attributableVisits,
    visitsLabel: VISITS_LABEL,
  };
}

export function listCampaigns(restaurantId: string) {
  const state = demoRepo.read();
  return success(
    state.campaigns
      .filter((c) => c.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

/** Quiet-hours helper for tests: SAST clock reading of an epoch. */
export function sastLabel(epochMs: number): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochMs));
}

