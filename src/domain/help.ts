import { demoRepo, updateDemo } from "@/data/repo";
import type {
  DemoSession,
  FeedbackScreenshot,
  HelpDraft,
  HelpRequest,
  PatronHelp,
  Restaurant,
} from "@/data/types";
import { clock } from "@/lib/clock";
import { maskPhone } from "@/lib/phone";
import { logAudit } from "./audit";
import { failure, success, type ApiResult } from "./demo";
import { ABOUT_LIMIT, TAGLINE_LIMIT } from "./page";

/** Help from Patron runs for a week unless the owner picks another length. */
export const HELP_DEFAULT_DAYS = 7;
export const HELP_DAY_CHOICES = [1, 7, 14, 30] as const;
export const HELP_DAYS_MAX = 30;
/** The exact words the owner sees on every draft. Do not reword in a hurry. */
export const HELP_DRAFT_LABEL = "Patron prepared this";
export const HELP_SUMMARY_LIMIT = 140;
export const HELP_REPLY_LIMIT = 300;
export const HELP_ASK_MIN = 10;
export const HELP_ASK_LIMIT = 800;
export const HELP_PHOTOS_MAX = 3;
export const HELP_PHOTO_MAX_BYTES = 300_000;

const DAY = 86_400_000;

export type HelpState = {
  enabled: boolean;
  /** On, switched on by the owner, and not past its expiry. */
  active: boolean;
  expiresAt: string | null;
  /** Whole days left, rounded up. Zero when help is off or finished. */
  daysLeft: number;
};

export type HelpMode = {
  active: boolean;
  /** True when a session was open but the owner's help window has now passed. */
  ended: boolean;
  restaurantId: string | null;
  operator: string | null;
  until: string | null;
};

/** Drop the help session without leaving an `undefined` key behind. */
function withoutHelpMode(session: DemoSession): DemoSession {
  const next = { ...session };
  delete next.helpMode;
  return next;
}

function restaurantFor(restaurantId: string): Restaurant | undefined {
  return demoRepo.read().restaurants.find((item) => item.id === restaurantId);
}

/** Short date such as "12 Nov" in Johannesburg time. */
export function helpDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  });
}

/** What the owner switch says right now, expiry included. */
export function helpStateFor(restaurantId: string, now = clock.now()): HelpState {
  const patronHelp = restaurantFor(restaurantId)?.patronHelp;
  if (!patronHelp?.enabled || !patronHelp.expiresAt) {
    return { enabled: false, active: false, expiresAt: null, daysLeft: 0 };
  }
  const expires = Date.parse(patronHelp.expiresAt);
  const active = Number.isFinite(expires) && expires > now;
  return {
    enabled: true,
    active,
    expiresAt: patronHelp.expiresAt,
    daysLeft: active ? Math.max(1, Math.ceil((expires - now) / DAY)) : 0,
  };
}

function canManage(session: DemoSession, restaurantId: string): boolean {
  return (
    (session.role === "owner" || session.role === "manager") &&
    session.restaurantId === restaurantId
  );
}

/** The owner turns help on for a set number of days, or stops it right away. */
export function setHelpAccess(input: {
  restaurantId: string;
  enabled: boolean;
  days?: number;
  session: DemoSession;
}): ApiResult<HelpState> {
  const restaurant = restaurantFor(input.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  if (!canManage(input.session, restaurant.id)) {
    return failure("FORBIDDEN", "Only the owner can change help from Patron.");
  }
  const now = clock.now();
  const days = Math.min(
    HELP_DAYS_MAX,
    Math.max(1, Math.round(input.days ?? HELP_DEFAULT_DAYS)),
  );
  const patronHelp: PatronHelp = input.enabled
    ? {
        enabled: true,
        expiresAt: new Date(now + days * DAY).toISOString(),
        grantedAt: new Date(now).toISOString(),
        grantedBy: "Owner",
      }
    : { enabled: false, expiresAt: null };
  updateDemo((state) => ({
    ...state,
    restaurants: state.restaurants.map((item) =>
      item.id === restaurant.id ? { ...item, patronHelp } : item,
    ),
    // Switching help off ends any open help session at once.
    session:
      !input.enabled && state.session.helpMode?.restaurantId === restaurant.id
        ? withoutHelpMode(state.session)
        : state.session,
  }));
  logAudit({
    actor: "Owner",
    action: input.enabled ? "help_enabled" : "help_disabled",
    restaurantId: restaurant.id,
    ...(input.enabled ? { object: `help-until:${patronHelp.expiresAt}` } : {}),
  });
  return success(helpStateFor(restaurant.id, now));
}

/** The help session in the browser, checked against the owner's expiry. */
export function helpModeNow(now = clock.now()): HelpMode {
  const mode = demoRepo.read().session.helpMode;
  if (!mode) {
    return { active: false, ended: false, restaurantId: null, operator: null, until: null };
  }
  const access = helpStateFor(mode.restaurantId, now);
  const until = Date.parse(mode.until);
  const active = access.active && Number.isFinite(until) && until > now;
  return {
    active,
    ended: !active,
    restaurantId: mode.restaurantId,
    operator: mode.operator,
    until: mode.until,
  };
}

function requireHelp(
  restaurantId: string,
  session: DemoSession,
): ApiResult<{ operator: string; until: string }> {
  if (session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can work in help mode.");
  }
  const mode = helpModeNow();
  if (mode.active && mode.restaurantId === restaurantId) {
    return success({ operator: mode.operator ?? "Patron", until: mode.until ?? "" });
  }
  if (mode.ended && mode.restaurantId === restaurantId) {
    return failure(
      "FORBIDDEN",
      `Help from Patron for this restaurant has ended. The owner has to turn it on again.`,
    );
  }
  return failure("FORBIDDEN", "This restaurant has not opened help mode for Patron.");
}

/** An operator opens help mode only while the owner's switch is on. */
export function startHelpMode(input: {
  restaurantId: string;
  operator: string;
  session: DemoSession;
}): ApiResult<{ restaurantId: string; operator: string; until: string }> {
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can open help mode.");
  }
  const access = helpStateFor(input.restaurantId);
  if (!access.active || !access.expiresAt) {
    return failure(
      "FORBIDDEN",
      access.expiresAt
        ? `Help from Patron ended on ${helpDate(access.expiresAt)}. Ask the owner to turn it on again.`
        : "This restaurant has not turned on help from Patron.",
    );
  }
  const operator = input.operator.trim().slice(0, 60);
  if (operator.length < 2) {
    return failure("INVALID", "Add your name so the owner can see who helped.");
  }
  const until = access.expiresAt;
  updateDemo((state) => ({
    ...state,
    session: { ...state.session, helpMode: { restaurantId: input.restaurantId, operator, until } },
  }));
  logAudit({
    actor: operator,
    action: "help_start",
    restaurantId: input.restaurantId,
    object: `help-until:${until}`,
  });
  return success({ restaurantId: input.restaurantId, operator, until });
}

export function stopHelpMode(input: { session: DemoSession }): ApiResult<null> {
  const mode = helpModeNow();
  if (!mode.restaurantId) return success(null);
  if (input.session.role !== "operator") {
    return failure("FORBIDDEN", "Only the Patron team can close their help session.");
  }
  updateDemo((state) => ({ ...state, session: withoutHelpMode(state.session) }));
  logAudit({
    actor: mode.operator ?? "Patron",
    action: "help_stop",
    restaurantId: mode.restaurantId,
  });
  return success(null);
}

/** Drafts belong to one restaurant and never cross the fence. */
export function draftsFor(input: {
  restaurantId: string;
  session: DemoSession;
}): ApiResult<HelpDraft[]> {
  const help = canManage(input.session, input.restaurantId)
    ? success(null)
    : requireHelp(input.restaurantId, input.session);
  if (!help.ok) return help;
  return success(
    demoRepo
      .read()
      .helpDrafts.filter((draft) => draft.restaurantId === input.restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

function checkDraftWords(tagline: string, about: string, summary: string): ApiResult<null> {
  if (tagline.length < 2 || tagline.length > TAGLINE_LIMIT) {
    return failure("INVALID", `Add a tagline of 2 to ${TAGLINE_LIMIT} characters.`);
  }
  if (about.length > ABOUT_LIMIT) {
    return failure("INVALID", `Keep the story text to ${ABOUT_LIMIT} characters or fewer.`);
  }
  if (summary.length < 3 || summary.length > HELP_SUMMARY_LIMIT) {
    return failure("INVALID", `Say in one line what changed, up to ${HELP_SUMMARY_LIMIT} characters.`);
  }
  return success(null);
}

/**
 * The only way help mode writes: a draft, labelled for the owner. Nothing here
 * touches the live page, a message or the credit balance.
 */
export function prepareDraft(input: {
  restaurantId: string;
  tagline: string;
  about: string;
  summary: string;
  requestId?: string;
  session: DemoSession;
}): ApiResult<HelpDraft> {
  const help = requireHelp(input.restaurantId, input.session);
  if (!help.ok) return help;
  const tagline = input.tagline.trim();
  const about = input.about.trim();
  const summary = input.summary.trim();
  const words = checkDraftWords(tagline, about, summary);
  if (!words.ok) return words;
  const state = demoRepo.read();
  const request = input.requestId
    ? state.helpRequests.find(
        (item) => item.id === input.requestId && item.restaurantId === input.restaurantId,
      )
    : undefined;
  if (input.requestId && !request) {
    return failure("NOT_FOUND", "That request is not open for this restaurant.");
  }
  if (request && request.status === "closed") {
    return failure("INVALID", "That request is already closed.");
  }
  const draft: HelpDraft = {
    id: `help-draft-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    tagline,
    about,
    summary,
    label: HELP_DRAFT_LABEL,
    preparedBy: help.data.operator,
    status: "draft",
    ...(request ? { requestId: request.id } : {}),
    createdAt: new Date(clock.now()).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    helpDrafts: [draft, ...current.helpDrafts],
    helpRequests: request
      ? current.helpRequests.map((item) =>
          item.id === request.id
            ? { ...item, status: "answered" as const, reply: summary, draftId: draft.id }
            : item,
        )
      : current.helpRequests,
  }));
  logAudit({
    actor: draft.preparedBy,
    action: "help_draft",
    restaurantId: input.restaurantId,
    object: draft.id,
  });
  if (request) {
    logAudit({
      actor: draft.preparedBy,
      action: "help_reply",
      restaurantId: input.restaurantId,
      object: request.id,
    });
  }
  return success(draft);
}

/** Only the owner moves draft words onto the live page. */
export function applyDraft(input: { draftId: string; session: DemoSession }): ApiResult<HelpDraft> {
  const state = demoRepo.read();
  const draft = state.helpDrafts.find((item) => item.id === input.draftId);
  if (!draft) return failure("NOT_FOUND", "Draft not found.");
  if (!canManage(input.session, draft.restaurantId)) {
    return failure("FORBIDDEN", "Only the owner can use a draft from Patron.");
  }
  if (draft.status !== "draft") {
    return failure("INVALID", "That draft has already been used or thrown away.");
  }
  const updated: HelpDraft = { ...draft, status: "used" };
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((restaurant) =>
      restaurant.id === draft.restaurantId
        ? {
            ...restaurant,
            aboutText: draft.about,
            theme: { ...restaurant.theme, tagline: draft.tagline },
          }
        : restaurant,
    ),
    helpDrafts: current.helpDrafts.map((item) => (item.id === draft.id ? updated : item)),
  }));
  logAudit({
    actor: "Owner",
    action: "help_draft_used",
    restaurantId: draft.restaurantId,
    object: draft.id,
  });
  return success(updated);
}

export function discardDraft(input: { draftId: string; session: DemoSession }): ApiResult<HelpDraft> {
  const draft = demoRepo.read().helpDrafts.find((item) => item.id === input.draftId);
  if (!draft) return failure("NOT_FOUND", "Draft not found.");
  if (!canManage(input.session, draft.restaurantId)) {
    return failure("FORBIDDEN", "Only the owner can throw away a draft from Patron.");
  }
  if (draft.status !== "draft") {
    return failure("INVALID", "That draft has already been used or thrown away.");
  }
  const updated: HelpDraft = { ...draft, status: "discarded" };
  updateDemo((current) => ({
    ...current,
    helpDrafts: current.helpDrafts.map((item) => (item.id === draft.id ? updated : item)),
  }));
  logAudit({
    actor: "Owner",
    action: "help_draft_discarded",
    restaurantId: draft.restaurantId,
    object: draft.id,
  });
  return success(updated);
}

export function requestsFor(input: {
  restaurantId: string;
  session: DemoSession;
}): ApiResult<HelpRequest[]> {
  const help = canManage(input.session, input.restaurantId)
    ? success(null)
    : requireHelp(input.restaurantId, input.session);
  if (!help.ok) return help;
  return success(
    demoRepo
      .read()
      .helpRequests.filter((item) => item.restaurantId === input.restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

/** The owner asks for a piece of work and may add up to three pictures. */
export function askRequest(input: {
  restaurantId: string;
  ask: string;
  photos?: FeedbackScreenshot[];
  session: DemoSession;
}): ApiResult<HelpRequest> {
  if (!canManage(input.session, input.restaurantId)) {
    return failure("FORBIDDEN", "Only the owner can ask Patron for work.");
  }
  const ask = input.ask.trim();
  if (ask.length < HELP_ASK_MIN || ask.length > HELP_ASK_LIMIT) {
    return failure("INVALID", `Describe the work in ${HELP_ASK_MIN} to ${HELP_ASK_LIMIT} characters.`);
  }
  const photos = (input.photos ?? []).filter((photo) => photo?.dataUrl);
  if (photos.length > HELP_PHOTOS_MAX) {
    return failure("INVALID", `Add up to ${HELP_PHOTOS_MAX} pictures.`);
  }
  const tooBig = photos.find((photo) => photo.dataUrl.length > HELP_PHOTO_MAX_BYTES * 1.4);
  if (tooBig) {
    return failure("INVALID", "One picture is too large. Use a smaller photo.");
  }
  const request: HelpRequest = {
    id: `help-request-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    ask,
    photos,
    status: "open",
    createdAt: new Date(clock.now()).toISOString(),
  };
  updateDemo((current) => ({ ...current, helpRequests: [request, ...current.helpRequests] }));
  logAudit({
    actor: "Owner",
    action: "help_request",
    restaurantId: input.restaurantId,
    object: request.id,
  });
  return success(request);
}

/** Patron answers a request with a draft and a short note. */
export function answerRequest(input: {
  requestId: string;
  reply: string;
  tagline: string;
  about: string;
  session: DemoSession;
}): ApiResult<{ request: HelpRequest; draft: HelpDraft }> {
  const request = demoRepo.read().helpRequests.find((item) => item.id === input.requestId);
  if (!request) return failure("NOT_FOUND", "Request not found.");
  const help = requireHelp(request.restaurantId, input.session);
  if (!help.ok) return help;
  if (request.status !== "open") {
    return failure("INVALID", "That request already has an answer.");
  }
  const reply = input.reply.trim();
  if (reply.length < 3 || reply.length > HELP_REPLY_LIMIT) {
    return failure("INVALID", `Answer in 3 to ${HELP_REPLY_LIMIT} characters.`);
  }
  // Answering always leaves a draft behind. It never changes the live page.
  const draft = prepareDraft({
    restaurantId: request.restaurantId,
    tagline: input.tagline,
    about: input.about,
    summary: reply.slice(0, HELP_SUMMARY_LIMIT),
    requestId: request.id,
    session: input.session,
  });
  if (!draft.ok) return draft;
  const answered = demoRepo.read().helpRequests.find((item) => item.id === request.id)!;
  return success({ request: answered, draft: draft.data });
}

export function closeRequest(input: { requestId: string; session: DemoSession }): ApiResult<HelpRequest> {
  const request = demoRepo.read().helpRequests.find((item) => item.id === input.requestId);
  if (!request) return failure("NOT_FOUND", "Request not found.");
  if (!canManage(input.session, request.restaurantId)) {
    return failure("FORBIDDEN", "Only the owner can close a request.");
  }
  const updated: HelpRequest = { ...request, status: "closed" };
  updateDemo((current) => ({
    ...current,
    helpRequests: current.helpRequests.map((item) => (item.id === request.id ? updated : item)),
  }));
  return success(updated);
}

/** True while an operator is helping in this restaurant. Guest details stay masked. */
export function operatorPhoneLock(restaurantId: string, now = clock.now()): boolean {
  const mode = demoRepo.read().session.helpMode;
  if (!mode || mode.restaurantId !== restaurantId) return false;
  const until = Date.parse(mode.until);
  return Number.isFinite(until) && until > now && helpStateFor(restaurantId, now).active;
}

/** What an operator may see about guests: a masked number, never the full one. */
export function maskedGuestsFor(input: {
  restaurantId: string;
  session: DemoSession;
}): ApiResult<Array<{ name: string; phone: string; stamps: number; lastVisitAt: string | null }>> {
  const help = requireHelp(input.restaurantId, input.session);
  if (!help.ok) return help;
  const state = demoRepo.read();
  const rows = state.memberships
    .filter((membership) => membership.restaurantId === input.restaurantId)
    .map((membership) => {
      const customer = state.customers.find((item) => item.id === membership.customerId);
      return {
        name: customer?.name ?? "Guest",
        phone: maskPhone(customer?.phoneE164 ?? ""),
        stamps: membership.stampsCurrent,
        lastVisitAt: membership.lastVisitAt,
      };
    })
    .sort((a, b) => b.stamps - a.stamps)
    .slice(0, 12);
  return success(rows);
}
