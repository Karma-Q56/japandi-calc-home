import { demoRepo, updateDemo } from "@/data/repo";
import type { Idea, IdeaStatus } from "@/data/types";
import { failure, success, type ApiResult } from "./demo";
import { logAudit } from "./audit";

export const IDEA_STATUSES: IdeaStatus[] = ["new", "exploring", "added"];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "New",
  exploring: "Exploring",
  added: "Added",
};

export type IdeaInput = {
  place: string;
  suburb: string;
  note?: string | undefined;
  name?: string | undefined;
  website?: string | undefined; // honeypot, must be empty
  now?: number | undefined;
};

export type IdeaFilters = {
  search?: string | undefined;
  status?: IdeaStatus | "all" | undefined;
  suburb?: string | undefined;
};

/** Owner-facing summary: how many asks each nearby place has, never who asked. */
export interface IdeaBoardPlace {
  place: string;
  suburb: string;
  asks: number;
  status: IdeaStatus;
  latestAt: string;
}

export function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

const MAX_NOTE = 400;
const MAX_NAME = 60;
const MAX_PLACE = 120;
const MAX_SUBURB = 120;

/**
 * Everyone can send an idea. There is no consent box by design: an idea keeps
 * the place, the suburb and an optional note only. The guest gives no phone or
 * email, and Patron promises not to publish any name that was given.
 */
export function submitIdea(input: IdeaInput): ApiResult<{ id: string; asks: number }> {
  if (clean(input.website)) return failure("INVALID", "Something went wrong. Please try again.");
  const place = clean(input.place);
  const suburb = clean(input.suburb);
  if (!place) return failure("INVALID", "Tell us which place you would like on Patron.");
  if (place.length > MAX_PLACE) return failure("INVALID", "Keep the place name under 120 characters.");
  if (!suburb) return failure("INVALID", "Add the suburb so we know where to look.");
  if (suburb.length > MAX_SUBURB) return failure("INVALID", "Keep the suburb under 120 characters.");
  const note = clean(input.note);
  if (note.length > MAX_NOTE) return failure("INVALID", `Keep the note under ${MAX_NOTE} characters.`);
  const name = clean(input.name);
  if (name.length > MAX_NAME) return failure("INVALID", `Keep your name under ${MAX_NAME} characters.`);

  const state = demoRepo.read();
  const now = input.now ?? state.now;
  const receivedAt = new Date(now).toISOString();
  const samePlace = (idea: Idea) =>
    idea.place.toLowerCase() === place.toLowerCase() && idea.suburb.toLowerCase() === suburb.toLowerCase();
  const existing = state.ideas.find(samePlace);

  // The same place and suburb asked again bumps the existing row's count
  // instead of growing the list, and the newest note and name win.
  if (existing) {
    const updated: Idea = {
      ...existing,
      asks: existing.asks + 1,
      createdAt: receivedAt,
    };
    if (note) updated.note = note;
    if (name) updated.name = name;
    updateDemo((current) => ({
      ...current,
      ideas: current.ideas.map((idea) => (idea.id === updated.id ? updated : idea)),
    }));
    return success({ id: updated.id, asks: updated.asks });
  }

  const idea: Idea = {
    id: `idea-${crypto.randomUUID()}`,
    place,
    suburb,
    asks: 1,
    ...(note ? { note } : {}),
    ...(name ? { name } : {}),
    status: "new",
    createdAt: receivedAt,
  };
  updateDemo((current) => ({ ...current, ideas: [idea, ...current.ideas] }));
  logAudit({ actor: "guest", action: "idea_received", object: idea.id });
  return success({ id: idea.id, asks: 1 });
}

export function countAsks(ideas: Idea[], place: string, suburb: string): number {
  // There is one row per place and suburb, so the row carries the total.
  const row = ideas.find(
    (idea) => idea.place.toLowerCase() === place.toLowerCase() && idea.suburb.toLowerCase() === suburb.toLowerCase(),
  );
  return row?.asks ?? 0;
}

/** Owner sees asks around their own venue's suburb, names never shown. */
export function listIdeasForOwner(input: {
  session: { role: string; restaurantId?: string | undefined };
}): ApiResult<{ suburb: string; places: IdeaBoardPlace[] }> {
  if (input.session.role !== "owner" && input.session.role !== "manager" && input.session.role !== "operator") {
    return failure("FORBIDDEN", "Open this page as a restaurant owner.");
  }
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.session.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Open this page from a restaurant.");
  const places = groupPlaces(state.ideas, restaurant.suburb);
  return success({ suburb: restaurant.suburb, places });
}

function groupPlaces(ideas: Idea[], suburb: string): IdeaBoardPlace[] {
  const matches = ideas.filter((idea) => idea.suburb.toLowerCase() === suburb.toLowerCase());
  const byPlace = new Map<string, IdeaBoardPlace>();
  for (const idea of matches) {
    const key = `${idea.place}|${idea.suburb}`.toLowerCase();
    const current = byPlace.get(key);
    if (current) {
      current.asks += idea.asks;
      if (idea.createdAt > current.latestAt) current.latestAt = idea.createdAt;
    } else {
      byPlace.set(key, {
        place: idea.place,
        suburb: idea.suburb,
        asks: idea.asks,
        status: idea.status,
        latestAt: idea.createdAt,
      });
    }
  }
  return [...byPlace.values()].sort((a, b) => b.asks - a.asks || a.place.localeCompare(b.place));
}

export interface IdeaInbox {
  ideas: Idea[];
  counts: Record<IdeaStatus, number>;
  total: number;
  suburbs: string[];
}

/** Operator-only inbox with search, a status filter and the full note. */
export function listIdeas(input: {
  session: { role: string };
  filters?: IdeaFilters | undefined;
}): ApiResult<IdeaInbox> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can read ideas.");
  }
  const all = demoRepo.read().ideas.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts: Record<IdeaStatus, number> = { new: 0, exploring: 0, added: 0 };
  for (const idea of all) counts[idea.status] = (counts[idea.status] ?? 0) + 1;
  const suburbs = [...new Set(all.map((idea) => idea.suburb))].sort((a, b) => a.localeCompare(b));
  const filters = input.filters ?? {};
  const search = clean(filters.search).toLowerCase();
  const filtered = all
    .filter((idea) => (filters.status && filters.status !== "all" ? idea.status === filters.status : true))
    .filter((idea) => (filters.suburb && filters.suburb !== "all" ? idea.suburb === filters.suburb : true))
    .filter((idea) =>
      search ? [idea.place, idea.suburb, idea.note, idea.name].filter(Boolean).join(" ").toLowerCase().includes(search) : true,
    );
  return success({ ideas: filtered, counts, total: filtered.length, suburbs });
}

export function updateIdea(input: {
  id: string;
  status?: IdeaStatus | undefined;
  notes?: string | undefined;
  session: { role: string };
}): ApiResult<Idea> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can change an idea.");
  }
  const state = demoRepo.read();
  const existing = state.ideas.find((idea) => idea.id === input.id);
  if (!existing) return failure("NOT_FOUND", "That idea no longer exists.");
  const updated: Idea = {
    ...existing,
    ...(input.status ? { status: input.status } : {}),
    ...(typeof input.notes === "string" ? { adminNotes: input.notes.trim().slice(0, 1000) } : {}),
  };
  updateDemo((current) => ({
    ...current,
    ideas: current.ideas.map((idea) => (idea.id === updated.id ? updated : idea)),
  }));
  logAudit({ actor: "operator", action: "idea_updated", object: updated.id });
  return success(updated);
}

/** Plain text the operator can paste into WhatsApp or an email. */
export function ideaDetails(idea: Idea): string {
  const rows: Array<[string, string | undefined]> = [
    ["Place", idea.place],
    ["Suburb", idea.suburb],
    ["Note", idea.note],
    ["Name the guest gave", idea.name],
    ["Status", IDEA_STATUS_LABELS[idea.status]],
    ["Received", new Date(idea.createdAt).toLocaleString("en-ZA")],
    ["Notes", idea.adminNotes],
  ];
  return rows
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
