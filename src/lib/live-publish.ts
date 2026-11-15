// Plain readiness rules and wording for publishing (phase D10). Browser-safe.

export type Readiness = {
  hasMenu: boolean;
  hasStaff: boolean;
  hasSuburb: boolean;
};

export type PublishStatus = "draft" | "active" | "paused" | "closed";

export const READINESS_STEPS = [
  {
    key: "hasMenu",
    label: "Add at least one menu item",
    href: "/app/menu",
    fix: "Add your menu",
  },
  {
    key: "hasStaff",
    label: "Add a team member and pair the till",
    href: "/app/team",
    fix: "Add your team",
  },
  {
    key: "hasSuburb",
    label: "Set your suburb",
    href: "/app/settings",
    fix: "Add your suburb",
  },
] as const;

export function isReady(readiness: Readiness): boolean {
  return readiness.hasMenu && readiness.hasStaff && readiness.hasSuburb;
}

/** The first condition still missing, as a plain sentence, or null when ready. */
export function firstMissingReason(readiness: Readiness): string | null {
  if (!readiness.hasMenu) return "Add at least one menu item first.";
  if (!readiness.hasStaff) return "Add a team member and pair the till first.";
  if (!readiness.hasSuburb) return "Set your suburb first.";
  return null;
}

export function statusLabel(status: PublishStatus): string {
  if (status === "active") return "Live";
  if (status === "paused") return "Paused";
  if (status === "closed") return "Closed";
  return "Private";
}

const REFUSAL_MESSAGES: Record<string, string> = {
  not_allowed: "Only the owner or a manager can change this.",
  not_ready: "Finish the checklist before you publish.",
  bad_state: "This restaurant is not in the right state for that change yet.",
  rate_limited: "You have tried too many times this hour. Try again later.",
};

/** Map a short refusal code to a plain sentence. Unknown codes get a safe default. */
export function publishErrorMessage(code: string | null | undefined): string {
  if (code && REFUSAL_MESSAGES[code]) return REFUSAL_MESSAGES[code];
  return "We could not update your restaurant. Try again.";
}

export const UNPUBLISH_CONFIRM =
  "Guests will no longer see your page or be able to join.";
