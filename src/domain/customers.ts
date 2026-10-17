import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { maskPhone } from "@/lib/phone";
import { failure, success } from "./demo";
import { logAudit, requireScope } from "./audit";

export type CustomerFilter =
  "all" | "new14" | "regulars" | "lapsed30" | "lapsed45" | "lapsed60" | "sms";

export type CustomerSort = "recent" | "stamps" | "name";

export interface CustomerRow {
  customerId: string;
  membershipId: string;
  name: string;
  maskedPhone: string;
  joinedAt: string;
  lastVisitAt: string | null;
  stampsCurrent: number;
  rewardsWaiting: number;
  smsOptedIn: boolean;
  visits60: number;
}

const DAY = 86400000;

function rowsFor(restaurantId: string, now: number): CustomerRow[] {
  const state = demoRepo.read();
  return state.memberships
    .filter((m) => m.restaurantId === restaurantId)
    .map((m) => {
      const customer = state.customers.find((c) => c.id === m.customerId)!;
      const visits60 = state.stamps.filter(
        (s) =>
          s.membershipId === m.id &&
          s.status === "valid" &&
          now - new Date(s.createdAt).getTime() <= 60 * DAY,
      ).length;
      return {
        customerId: customer.id,
        membershipId: m.id,
        name: customer.name || "(removed)",
        maskedPhone: maskPhone(customer.phoneE164),
        joinedAt: m.joinedAt,
        lastVisitAt: m.lastVisitAt,
        stampsCurrent: m.stampsCurrent,
        rewardsWaiting: state.rewards.filter((r) => r.membershipId === m.id && !r.redeemedAt)
          .length,
        smsOptedIn: m.marketingSms,
        visits60,
      };
    });
}

export function listCustomers(input: {
  restaurantId: string;
  search?: string;
  filter?: CustomerFilter;
  sort?: CustomerSort;
  page?: number;
  session: { role: string; restaurantId?: string | undefined };
  now?: number;
}) {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const now = input.now ?? demoRepo.read().now;
  const filter = input.filter ?? "all";
  const sort = input.sort ?? "recent";
  const page = Math.max(1, input.page ?? 1);
  const needle = (input.search ?? "").trim().toLowerCase();
  let rows = rowsFor(input.restaurantId, now);
  if (needle) {
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.maskedPhone.toLowerCase().includes(needle),
    );
  }
  const daysSince = (iso: string | null) =>
    iso === null ? Infinity : (now - new Date(iso).getTime()) / DAY;
  if (filter === "new14") {
    rows = rows.filter((r) => now - new Date(r.joinedAt).getTime() <= 14 * DAY);
  } else if (filter === "regulars") {
    rows = rows.filter((r) => r.visits60 >= 4);
  } else if (filter === "lapsed30") {
    rows = rows.filter((r) => daysSince(r.lastVisitAt) >= 30);
  } else if (filter === "lapsed45") {
    rows = rows.filter((r) => daysSince(r.lastVisitAt) >= 45);
  } else if (filter === "lapsed60") {
    rows = rows.filter((r) => daysSince(r.lastVisitAt) >= 60);
  } else if (filter === "sms") {
    rows = rows.filter((r) => r.smsOptedIn);
  }
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "stamps") rows.sort((a, b) => b.stampsCurrent - a.stampsCurrent);
  else rows.sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));
  const total = rows.length;
  const pageRows = rows.slice((page - 1) * 25, page * 25);
  return success({ rows: pageRows, total, page });
}

export function revealPhone(input: {
  customerId: string;
  restaurantId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const customer = demoRepo.read().customers.find((c) => c.id === input.customerId);
  if (!customer) return failure("NOT_FOUND", "Guest not found.");
  logAudit({
    actor: input.actorId,
    action: "phone_reveal",
    restaurantId: input.restaurantId,
    object: `phone-reveal:${customer.id}`,
  });
  return success({ phone: customer.phoneE164 });
}

export function exportCsv(input: {
  restaurantId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  if (input.session.role !== "owner" && input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the owner can export the guest list.");
  }
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const lines = ["name,phone,joined,last_visit,stamps,sms_opted_in,visits"];
  for (const m of state.memberships.filter((x) => x.restaurantId === input.restaurantId)) {
    const customer = state.customers.find((c) => c.id === m.customerId)!;
    const visits = state.stamps.filter(
      (s) => s.membershipId === m.id && s.status === "valid",
    ).length;
    lines.push(
      [
        JSON.stringify(customer.name),
        customer.phoneE164,
        m.joinedAt,
        m.lastVisitAt ?? "",
        m.stampsCurrent,
        m.marketingSms,
        visits,
      ].join(","),
    );
  }
  logAudit({
    actor: input.actorId,
    action: "export",
    restaurantId: input.restaurantId,
    object: "csv-export",
  });
  return success({ csv: lines.join("\n") });
}

export function customerProfile(input: {
  customerId: string;
  restaurantId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const customer = state.customers.find((c) => c.id === input.customerId);
  const membership = state.memberships.find(
    (m) => m.customerId === input.customerId && m.restaurantId === input.restaurantId,
  );
  if (!customer || !membership) return failure("NOT_FOUND", "Guest not found.");
  return success({
    customer: { ...customer, phoneE164: maskPhone(customer.phoneE164) },
    membership,
    visits: state.stamps
      .filter((s) => s.membershipId === membership.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    rewards: state.rewards.filter((r) => r.membershipId === membership.id),
    campaigns: state.campaigns.filter((c) => c.restaurantId === input.restaurantId),
    consents: state.consents
      .filter((c) => c.membershipId === membership.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}

export function manualStamp(input: {
  membershipId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const state = demoRepo.read();
  const membership = state.memberships.find((m) => m.id === input.membershipId);
  if (!membership) return failure("NOT_FOUND", "Membership not found.");
  const scoped = requireScope(
    input.session.role,
    input.session.restaurantId,
    membership.restaurantId,
  );
  if (!scoped.ok) return scoped;
  const now = new Date(state.now).toISOString();
  const stampId = `stamp-${crypto.randomUUID()}`;
  updateDemo((current) => ({
    ...current,
    stamps: [
      ...current.stamps,
      {
        id: stampId,
        restaurantId: membership.restaurantId,
        membershipId: membership.id,
        staffId: input.actorId,
        key: `manual-${stampId}`,
        createdAt: now,
        status: "valid" as const,
      },
    ],
    memberships: current.memberships.map((m) =>
      m.id === membership.id
        ? {
            ...m,
            stampsCurrent: m.stampsCurrent + 1,
            stampsTotal: m.stampsTotal + 1,
            lastVisitAt: now,
          }
        : m,
    ),
  }));
  logAudit({
    actor: input.actorId,
    action: "manual_stamp",
    restaurantId: membership.restaurantId,
    object: `manual:${stampId}`,
  });
  return success({ stampId });
}

export function removeFromList(input: {
  membershipId: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}) {
  const state = demoRepo.read();
  const membership = state.memberships.find((m) => m.id === input.membershipId);
  if (!membership) return failure("NOT_FOUND", "Membership not found.");
  const scoped = requireScope(
    input.session.role,
    input.session.restaurantId,
    membership.restaurantId,
  );
  if (!scoped.ok) return scoped;
  const event = {
    id: crypto.randomUUID(),
    membershipId: membership.id,
    purpose: "marketing_sms" as const,
    action: "withdrawn" as const,
    wordingVersion: "v1",
    wordingText: "Removed from list by the restaurant.",
    source: "operator",
    createdAt: new Date(state.now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((m) =>
      m.id === membership.id ? { ...m, marketingSms: false, marketingPush: false } : m,
    ),
    consents: [...current.consents, event],
  }));
  logAudit({
    actor: input.actorId,
    action: "remove",
    restaurantId: membership.restaurantId,
    object: `remove:${membership.id}`,
  });
  return success(true);
}

export function clockNow() {
  return clock.now();
}
