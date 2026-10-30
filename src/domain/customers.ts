import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { maskPhone } from "@/lib/phone";
import { birthdayOf, birthdayLabel, johannesburgMonthDay } from "@/lib/birthday";
import { dayName, TIME_OF_DAY_LABEL, visitPattern } from "@/lib/visits";
import type { VisitPattern } from "@/lib/visits";
import { failure, success, type ApiResult } from "./demo";
import { logAudit, requireScope } from "./audit";

export type CustomerFilter =
  "all" | "new14" | "regulars" | "lapsed30" | "lapsed45" | "lapsed60" | "sms" | "birthdays";

export type CustomerSort = "recent" | "stamps" | "fewest_stamps" | "visits" | "name";

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
    .filter(
      (membership) =>
        membership.restaurantId === restaurantId &&
        state.customers.some((customer) => customer.id === membership.customerId && !customer.deleted),
    )
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
  const state = demoRepo.read();
  const needle = (input.search ?? "").trim().toLowerCase();
  let rows = rowsFor(input.restaurantId, now);
  if (needle) {
    rows = rows.filter((row) => {
      const customer = state.customers.find((item) => item.id === row.customerId);
      return (
        row.name.toLowerCase().includes(needle) ||
        row.maskedPhone.toLowerCase().includes(needle) ||
        customer?.phoneE164.toLowerCase().includes(needle) === true
      );
    });
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
  } else if (filter === "birthdays") {
    const month = johannesburgMonthDay(now).month;
    rows = rows.filter((r) => {
      const customer = state.customers.find((item) => item.id === r.customerId);
      const birthday = birthdayOf(customer);
      return birthday !== null && birthday.month === month;
    });
  }
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "stamps") rows.sort((a, b) => b.stampsCurrent - a.stampsCurrent);
  else if (sort === "fewest_stamps") rows.sort((a, b) => a.stampsCurrent - b.stampsCurrent);
  else if (sort === "visits") rows.sort((a, b) => b.visits60 - a.visits60);
  else rows.sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));
  const total = rows.length;
  const pageRows = rows.slice((page - 1) * 25, page * 25);
  return success({ rows: pageRows, total, page });
}

export function matchingCustomerMembershipIds(input: {
  restaurantId: string;
  search?: string;
  filter?: CustomerFilter;
  sort?: CustomerSort;
  session: { role: string; restaurantId?: string | undefined };
  now?: number;
}) {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const now = input.now ?? demoRepo.read().now;
  const filter = input.filter ?? "all";
  const sort = input.sort ?? "recent";
  const state = demoRepo.read();
  const needle = (input.search ?? "").trim().toLowerCase();
  const rows = rowsFor(input.restaurantId, now).filter((row) => {
    if (needle) {
      const customer = state.customers.find((item) => item.id === row.customerId);
      if (
        !row.name.toLowerCase().includes(needle) &&
        !row.maskedPhone.toLowerCase().includes(needle) &&
        customer?.phoneE164.toLowerCase().includes(needle) !== true
      ) return false;
    }
    const daysSince = (iso: string | null) =>
      iso === null ? Infinity : (now - new Date(iso).getTime()) / DAY;
    if (filter === "new14" && now - Date.parse(row.joinedAt) > 14 * DAY) return false;
    if (filter === "regulars" && row.visits60 < 4) return false;
    if (filter === "lapsed30" && daysSince(row.lastVisitAt) < 30) return false;
    if (filter === "lapsed45" && daysSince(row.lastVisitAt) < 45) return false;
    if (filter === "lapsed60" && daysSince(row.lastVisitAt) < 60) return false;
    if (filter === "sms" && !row.smsOptedIn) return false;
    return true;
  });
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "stamps") rows.sort((a, b) => b.stampsCurrent - a.stampsCurrent);
  else if (sort === "fewest_stamps") rows.sort((a, b) => a.stampsCurrent - b.stampsCurrent);
  else if (sort === "visits") rows.sort((a, b) => b.visits60 - a.visits60);
  else rows.sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));
  return success(rows.map((row) => row.membershipId));
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

/** Everything the owner needs to know what to say to one guest. */
export interface GuestKnowledge {
  sentence: string;
  topItems: Array<{ label: string; qty: number }>;
  pattern: VisitPattern;
  patternSummary: string;
  birthday: string | null;
  rewardsWaiting: number;
  rewardsRedeemed: number;
  lastMessage: {
    body: string;
    sentAt: string;
    worked: boolean;
  } | null;
}

/**
 * One plain sentence plus the facts behind it, from this restaurant's own
 * records only: stamps, orders, rewards, birthdays and messages.
 */
export function knowYourGuest(input: {
  membershipId: string;
  restaurantId: string;
  session: { role: string; restaurantId?: string | undefined };
}): ApiResult<GuestKnowledge> {
  const scoped = requireScope(input.session.role, input.session.restaurantId, input.restaurantId);
  if (!scoped.ok) return scoped;
  const state = demoRepo.read();
  const membership = state.memberships.find((m) => m.id === input.membershipId);
  if (!membership || membership.restaurantId !== input.restaurantId) {
    return failure("NOT_FOUND", "Guest not found.");
  }
  const customer = state.customers.find((c) => c.id === membership.customerId);
  if (!customer) return failure("NOT_FOUND", "Guest not found.");
  const now = new Date(state.now).toISOString();

  const stamps = state.stamps.filter(
    (s) => s.membershipId === membership.id && s.status === "valid",
  );
  const pattern = visitPattern(stamps, now);

  // Favourite items, from the till orders attached to this membership.
  const itemCount = new Map<string, { label: string; qty: number }>();
  for (const order of state.orders) {
    if (order.membershipId !== membership.id) continue;
    for (const line of order.items) {
      const id = `${line.kind}:${line.label.toLowerCase()}`;
      const entry = itemCount.get(id);
      itemCount.set(id, { label: line.label, qty: (entry?.qty ?? 0) + line.qty });
    }
  }
  const topItems = [...itemCount.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);

  const firstName = (customer.name.split(" ")[0] ?? customer.name).trim();
  const birthday = birthdayOf(customer);

  const dayList = pattern.usualDays.map(dayName);
  const sentenceParts: string[] = [];
  if (pattern.visits === 0) {
    sentenceParts.push(`${firstName} has a card but has not come in yet.`);
  } else {
    const parts: string[] = [];
    parts.push(
      dayList.length > 0
        ? `${firstName} usually comes in on ${dayList.slice(0, 2).join(" and ")}`
        : `${firstName} has stamped ${pattern.visits} ${pattern.visits === 1 ? "time" : "times"}`,
    );
    if (dayList.length > 0 && pattern.usualTime) {
      parts.push(`${TIME_OF_DAY_LABEL[pattern.usualTime]}`);
    }
    sentenceParts.push(`${parts.join(", ")}.`);
    if (topItems.length > 0) {
      sentenceParts.push(`She usually has ${topItems[0]!.label.toLowerCase()}.`);
    }
  }
  sentenceParts.push(
    `She has ${membership.stampsCurrent} stamps on her card.`,
  );
  if (birthday) sentenceParts.push(`Her birthday is ${birthdayLabel(birthday)}.`);
  if (pattern.slipping) {
    sentenceParts.push("It has been a while. A friendly hello might bring her back.");
  }

  const patternSummary =
    pattern.visits === 0
      ? "No visits recorded yet"
      : [
          pattern.usualDays.length > 0 ? dayList.slice(0, 2).join(" and ") : "no usual day",
          pattern.usualTime ? TIME_OF_DAY_LABEL[pattern.usualTime] : null,
          pattern.averageGapDays !== null ? `about ${pattern.averageGapDays} days apart` : null,
        ]
          .filter(Boolean)
          .join(", ");

  const rewardsWaiting = state.rewards.filter(
    (r) => r.membershipId === membership.id && !r.redeemedAt,
  ).length;
  const rewardsRedeemed = state.rewards.filter(
    (r) => r.membershipId === membership.id && r.redeemedAt,
  ).length;

  const messages = state.messages
    .filter((m) => m.customerId === customer.id && m.restaurantId === input.restaurantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastMessageRow = messages[0];
  const lastMessage = lastMessageRow
    ? {
        body: lastMessageRow.body,
        sentAt: lastMessageRow.sentAt ?? lastMessageRow.createdAt,
        worked: lastMessageRow.status === "delivered" || lastMessageRow.status === "sent",
      }
    : null;

  return success({
    sentence: sentenceParts.join(" "),
    topItems,
    pattern,
    patternSummary,
    birthday: birthday ? birthdayLabel(birthday) : null,
    rewardsWaiting,
    rewardsRedeemed,
    lastMessage,
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
