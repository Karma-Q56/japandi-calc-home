import { demoRepo, updateDemo } from "@/data/repo";
import type { Lead, LeadKind, LeadStatus } from "@/data/types";
import { failure, success, type ApiResult } from "./demo";
import { logAudit } from "./audit";

export type EnquiryInput = {
  kind: LeadKind;
  restaurantName?: string | undefined;
  contactName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  role?: string | undefined;
  venueType?: string | undefined;
  suburb?: string | undefined;
  quietTime?: string | undefined;
  weeklyGuests?: string | undefined;
  planInterest?: string | undefined;
  visitWanted?: boolean | undefined;
  preferredDay?: string | undefined;
  message?: string | undefined;
  consent: boolean;
  consentAt?: string | undefined;
  website?: string | undefined;
  now?: number | undefined;
};

const MAX_MESSAGE = 1000;

/** ENQ-YEAR-NUMBER. Numbers carry on from the highest one for that year. */
export function nextEnquiryReference(existing: Lead[], now: number): string {
  const year = new Date(now).getUTCFullYear();
  const prefix = `ENQ-${year}-`;
  let highest = 0;
  for (const lead of existing) {
    if (!lead.reference?.startsWith(prefix)) continue;
    const value = Number(lead.reference.slice(prefix.length));
    if (Number.isInteger(value) && value > highest) highest = value;
  }
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Everyone can send an enquiry. The same checks run in demo and live. */
export function submitEnquiry(input: EnquiryInput): ApiResult<{ id: string; reference: string }> {
  if (clean(input.website)) return failure("INVALID", "Something went wrong. Please try again.");
  if (!input.consent) return failure("INVALID", "Please tick the consent box so we can reply.");
  const message = clean(input.message);
  if (message.length > MAX_MESSAGE) {
    return failure("INVALID", `Keep your message under ${MAX_MESSAGE} characters.`);
  }
  const restaurantName = clean(input.restaurantName);
  const contactName = clean(input.contactName);
  const phone = clean(input.phone);
  const email = clean(input.email);

  if (input.kind === "owner") {
    if (!restaurantName) return failure("INVALID", "Tell us your restaurant name.");
    if (!contactName) return failure("INVALID", "Tell us your name.");
    if (!phone) return failure("INVALID", "Add a phone or WhatsApp number.");
  } else if (input.kind === "diner") {
    if (!restaurantName) return failure("INVALID", "Tell us which place you would like on Patron.");
    if (!clean(input.suburb)) return failure("INVALID", "Add the suburb so we can find the right place.");
  } else {
    if (!contactName) return failure("INVALID", "Tell us your name.");
    if (!phone && !email) return failure("INVALID", "Add a phone number or email so we can reply.");
    if (!message) return failure("INVALID", "Tell us what you need help with.");
  }

  const state = demoRepo.read();
  const now = input.now ?? state.now;
  const reference = nextEnquiryReference(state.leads, now);
  const lead: Lead = {
    id: `lead-${crypto.randomUUID()}`,
    reference,
    kind: input.kind,
    status: "new",
    restaurantName,
    contactName: input.kind === "diner" ? contactName || "Diner" : contactName,
    phone,
    ...(email ? { email } : {}),
    ...(clean(input.role) ? { role: clean(input.role) } : {}),
    ...(clean(input.venueType) ? { venueType: clean(input.venueType) } : {}),
    ...(clean(input.suburb) ? { suburb: clean(input.suburb) } : {}),
    ...(clean(input.quietTime) ? { quietTime: clean(input.quietTime) } : {}),
    ...(clean(input.weeklyGuests) ? { weeklyGuests: clean(input.weeklyGuests) } : {}),
    ...(clean(input.planInterest) ? { planInterest: clean(input.planInterest) } : {}),
    ...(input.kind === "owner" ? { visitWanted: input.visitWanted ?? false } : {}),
    ...(clean(input.preferredDay) ? { preferredDay: clean(input.preferredDay) } : {}),
    ...(message ? { message } : {}),
    consent: true,
    consentAt: input.consentAt ?? new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  updateDemo((current) => ({ ...current, leads: [lead, ...current.leads] }));
  logAudit({ actor: lead.reference, action: "enquiry_received", object: lead.id });
  return success({ id: lead.id, reference });
}

export type EnquiryFilters = {
  search?: string | undefined;
  status?: LeadStatus | "all" | undefined;
  kind?: LeadKind | "all" | undefined;
};

export interface EnquiryInbox {
  leads: Lead[];
  counts: Record<LeadStatus, number>;
  total: number;
  placesGuestsAskedFor: { name: string; count: number }[];
}

function matchesSearch(lead: Lead, search: string): boolean {
  if (!search) return true;
  const haystack = [
    lead.reference,
    lead.restaurantName,
    lead.contactName,
    lead.phone,
    lead.email,
    lead.suburb,
    lead.role,
    lead.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

/** Operator-only inbox. Contact details never go to an owner or guest. */
export function listEnquiries(input: {
  session: { role: string };
  filters?: EnquiryFilters | undefined;
}): ApiResult<EnquiryInbox> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can read enquiries.");
  }
  const leads = demoRepo.read().leads.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts: Record<LeadStatus, number> = { new: 0, replied: 0, closed: 0 };
  for (const lead of leads) {
    const status = lead.status ?? "new";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const places = new Map<string, number>();
  for (const lead of leads) {
    if (lead.kind !== "diner") continue;
    const name = lead.restaurantName.trim();
    if (name) places.set(name, (places.get(name) ?? 0) + 1);
  }
  const filters = input.filters ?? {};
  const search = clean(filters.search);
  const filtered = leads
    .filter((lead) => (filters.status && filters.status !== "all" ? lead.status === filters.status : true))
    .filter((lead) => (filters.kind && filters.kind !== "all" ? lead.kind === filters.kind : true))
    .filter((lead) => matchesSearch(lead, search));
  return success({
    leads: filtered,
    counts,
    total: filtered.length,
    placesGuestsAskedFor: [...places.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5),
  });
}

export function updateEnquiry(input: {
  id: string;
  status?: LeadStatus | undefined;
  notes?: string | undefined;
  session: { role: string };
}): ApiResult<Lead> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can change an enquiry.");
  }
  const state = demoRepo.read();
  const existing = state.leads.find((lead) => lead.id === input.id);
  if (!existing) return failure("NOT_FOUND", "That enquiry no longer exists.");
  const updated: Lead = {
    ...existing,
    ...(input.status ? { status: input.status } : {}),
    ...(typeof input.notes === "string" ? { adminNotes: input.notes.trim().slice(0, 1000) } : {}),
  };
  updateDemo((current) => ({
    ...current,
    leads: current.leads.map((lead) => (lead.id === updated.id ? updated : lead)),
  }));
  logAudit({ actor: "operator", action: "enquiry_updated", object: updated.id });
  return success(updated);
}

/** Plain text the operator can paste into WhatsApp, email or a call sheet. */
export function leadDetails(lead: Lead): string {
  const rows: Array<[string, string | undefined]> = [
    ["Reference", lead.reference],
    ["Type", lead.kind === "owner" ? "Restaurant owner" : lead.kind === "diner" ? "Diner" : "Something else"],
    ["Status", lead.status],
    ["Received", new Date(lead.createdAt).toLocaleString("en-ZA")],
    ["Restaurant", lead.restaurantName],
    ["Name", lead.contactName],
    ["Role", lead.role],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Type of place", lead.venueType],
    ["Suburb", lead.suburb],
    ["Quiet time", lead.quietTime],
    ["Guests a week", lead.weeklyGuests],
    ["Plan interest", lead.planInterest],
    ["Wants a visit", lead.kind === "owner" ? (lead.visitWanted ? "Yes" : "No") : undefined],
    ["Preferred day", lead.preferredDay],
    ["Message", lead.message],
    ["Notes", lead.adminNotes],
    ["Consent", lead.consent ? `Yes, recorded ${lead.consentAt ?? ""}`.trim() : "No"],
  ];
  return rows
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
