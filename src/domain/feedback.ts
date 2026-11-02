import { demoRepo, updateDemo } from "@/data/repo";
import type {
  Feedback,
  FeedbackCategory,
  FeedbackScreenshot,
  FeedbackSource,
  FeedbackStatus,
} from "@/data/types";
import { logAudit } from "./audit";
import { failure, success, type ApiResult } from "./demo";

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  "broken",
  "feature",
  "confusing",
  "other",
];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  broken: "Something is broken",
  feature: "I want a new feature",
  confusing: "Something is confusing",
  other: "Other",
};

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "new",
  "seen",
  "planned",
  "done",
  "not_now",
];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Seen",
  planned: "Planned",
  done: "Done",
  not_now: "Not now",
};

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  owner: "Owner",
  guest: "Diner",
  public: "Public page",
};

export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 1000;
/** Pictures are small on purpose: enough to show the problem, easy to store. */
export const FEEDBACK_SHOT_MAX_BYTES = 300 * 1024;
export const FEEDBACK_RATE_LIMIT = 5;
export const FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface FeedbackInput {
  source: FeedbackSource;
  category: FeedbackCategory | string;
  message: string;
  contactOk?: boolean;
  contact?: string | undefined;
  screenshot?: FeedbackScreenshot | null | undefined;
  restaurantId?: string;
  /** Honeypot. A real person never fills this in. */
  website?: string;
  now?: number;
}

export interface FeedbackFilters {
  status?: FeedbackStatus | "all";
  category?: FeedbackCategory | "all";
  source?: FeedbackSource | "all";
  search?: string;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function isCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as string[]).includes(value);
}

/** How many bytes a data URL really holds, without decoding it. */
export function screenshotBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

function screenshotProblem(shot: FeedbackScreenshot | null | undefined): string | null {
  if (!shot) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(shot.dataUrl)) {
    return "Choose a picture in PNG, JPG or WebP format.";
  }
  if (screenshotBytes(shot.dataUrl) > FEEDBACK_SHOT_MAX_BYTES) {
    return "Choose a picture under 300 KB.";
  }
  return null;
}

/**
 * One entry point for all three sources. The same checks run in demo and live:
 * length, category, picture type and size, honeypot and a per-hour rate limit.
 */
export function submitFeedback(
  input: FeedbackInput,
): ApiResult<{ id: string; stored: boolean }> {
  // A filled honeypot looks successful to the bot and stores nothing.
  if (clean(input.website)) return success({ id: "ignored", stored: false });

  const category = clean(input.category);
  if (!isCategory(category)) {
    return failure("INVALID", "Choose what your note is about.");
  }
  const message = clean(input.message);
  if (message.length < FEEDBACK_MIN) {
    return failure("INVALID", `Write at least ${FEEDBACK_MIN} characters so we understand.`);
  }
  if (message.length > FEEDBACK_MAX) {
    return failure("INVALID", `Keep your note under ${FEEDBACK_MAX} characters.`);
  }
  const contact = clean(input.contact);
  if (contact.length > 120) {
    return failure("INVALID", "Keep the contact detail under 120 characters.");
  }
  const problem = screenshotProblem(input.screenshot);
  if (problem) return failure("INVALID", problem);

  const state = demoRepo.read();
  const now = input.now ?? state.now;
  const key = input.restaurantId ?? "public";
  const recent = state.rateLimitHits.filter(
    (hit) => hit.createdAt > now - FEEDBACK_RATE_WINDOW_MS,
  );
  const sent = recent.filter(
    (hit) => hit.bucket === "feedback" && hit.key === key,
  ).length;
  if (sent >= FEEDBACK_RATE_LIMIT) {
    return failure(
      "RATE_LIMITED",
      "You have sent a few notes already. Please try again in an hour.",
    );
  }

  const entry: Feedback = {
    id: `feedback-${crypto.randomUUID()}`,
    source: input.source,
    category,
    message,
    contactOk: input.contactOk ?? false,
    status: "new",
    note: "",
    createdAt: new Date(now).toISOString(),
    ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
    ...(contact ? { contact } : {}),
    ...(input.screenshot ? { screenshot: input.screenshot } : {}),
  };

  updateDemo((current) => ({
    ...current,
    feedback: [entry, ...(current.feedback ?? [])],
    rateLimitHits: [...recent, { bucket: "feedback", key, createdAt: now }],
  }));
  logAudit({
    actor: input.source === "public" ? "visitor" : input.source,
    action: "feedback_received",
    object: entry.id,
    ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
  });
  return success({ id: entry.id, stored: true });
}

/** The signed-in owner's own notes, newest first. Never another venue's. */
export function feedbackForOwner(restaurantId: string): Feedback[] {
  return demoRepo
    .read()
    .feedback.filter(
      (item) => item.restaurantId === restaurantId && item.source !== "public",
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface FeedbackInbox {
  items: Feedback[];
  counts: Record<FeedbackStatus, number>;
  total: number;
}

/** Operator-only inbox with status, category, source and search filters. */
export function listFeedback(input: {
  session: { role: string };
  filters?: FeedbackFilters;
}): ApiResult<FeedbackInbox> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can read every note.");
  }
  const all = demoRepo
    .read()
    .feedback.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts: Record<FeedbackStatus, number> = {
    new: 0,
    seen: 0,
    planned: 0,
    done: 0,
    not_now: 0,
  };
  for (const item of all) counts[item.status] += 1;
  const filters = input.filters ?? {};
  const search = clean(filters.search).toLowerCase();
  const items = all
    .filter((item) =>
      filters.status && filters.status !== "all" ? item.status === filters.status : true,
    )
    .filter((item) =>
      filters.category && filters.category !== "all"
        ? item.category === filters.category
        : true,
    )
    .filter((item) =>
      filters.source && filters.source !== "all" ? item.source === filters.source : true,
    )
    .filter((item) =>
      search
        ? [item.message, item.contact, item.note, FEEDBACK_CATEGORY_LABELS[item.category]]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true,
    );
  return success({ items, counts, total: items.length });
}

/** Operators move a note along and keep a private note. Senders never edit it. */
export function updateFeedback(input: {
  id: string;
  status?: FeedbackStatus;
  note?: string;
  session: { role: string };
}): ApiResult<Feedback> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can change a note.");
  }
  const state = demoRepo.read();
  const existing = state.feedback.find((item) => item.id === input.id);
  if (!existing) return failure("NOT_FOUND", "That note no longer exists.");
  const updated: Feedback = {
    ...existing,
    ...(input.status ? { status: input.status } : {}),
    ...(typeof input.note === "string" ? { note: input.note.trim().slice(0, 1000) } : {}),
  };
  updateDemo((current) => ({
    ...current,
    feedback: current.feedback.map((item) =>
      item.id === updated.id ? updated : item,
    ),
  }));
  logAudit({ actor: "operator", action: "feedback_updated", object: updated.id });
  return success(updated);
}
