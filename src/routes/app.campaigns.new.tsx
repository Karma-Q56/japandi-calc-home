import { createFileRoute, redirect, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { countLabel } from "@/lib/count-label";
import { useEffect, useState } from "react";
import { getDataModeFn } from "@/server/live";
import { countRecipientsFn, createCampaignFn } from "@/server/live-campaign-create-fns";
import { getListsFn } from "@/server/live-lists-fns";
import {
  CHANNEL_CHOICES,
  CODE_PATTERN,
  MESSAGE_MAX,
  SEGMENT_SAMPLE_NAME,
  formatRand,
  heldCostCents,
  initialComposerSegment,
  parseComposerSearch,
  type ComposerSearch,
  reachFor,
  type LiveChannel,
  type ReachCounts,
} from "@/lib/live-campaigns";
import { api } from "@/api";
import {
  checkCopy,
  costPreview,
  eligibleMemberships,
  eligiblePushMemberships,
  fixCopy,
  messageSegments,
} from "@/domain/campaigns";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { PreviewOnly, PublishSteps, PushPreview, SmsPreview } from "@/components/patron/preview";
import { Switch } from "@/components/patron/Switch";
import { FormField, PageHeader } from "@/components/patron/dash";
import {
  applyFillIns,
  messageFillFacts,
  suggestMessages,
} from "@/domain/suggestions";

import type { CampaignAudience, SegmentType } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";

export const Route = createFileRoute("/app/campaigns/new")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => getDataModeFn(),
  validateSearch: (search: Record<string, unknown>) => parseComposerSearch(search),
  component: NewCampaignPage,
});

function NewCampaignPage() {
  const { mode } = Route.useLoaderData();
  const search = useSearch({ from: "/app/campaigns/new" });
  if (mode === "live") return <LiveCampaignComposer search={search} />;
  return <ComposerPage />;
}

function LiveCampaignComposer({ search }: { search: ComposerSearch }) {
  const router = useRouter();
  const start = initialComposerSegment(search);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(search.name ?? "");
  const [body, setBody] = useState(search.body ?? "Hi {first_name}, we miss you! Pop by this week.");
  const [code, setCode] = useState("");
  const [segment, setSegment] = useState<SegmentType>(start.segment);
  const [listId] = useState<string | undefined>(start.listId);
  const [listName, setListName] = useState<string | null>(null);
  const [day, setDay] = useState(search.weekday ?? 3);
  const [channel, setChannel] = useState<LiveChannel>("sms");
  const [counts, setCounts] = useState<ReachCounts | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Counted as the guest receives it: a long first name filled in and the STOP line added.
  const segments = messageSegments(body, SEGMENT_SAMPLE_NAME);
  const recipients = counts === null ? null : reachFor(channel, counts);
  const cost = counts === null ? 0 : heldCostCents(channel, counts, segments);
  const liveAudience = (): CampaignAudience => {
    if (segment === "weekday") return { type: "weekday", weekday: day };
    if (segment === "new") return { type: "new", days: 14 };
    if (segment === "lapsed30") return { type: "lapsed30", days: 30 };
    if (segment === "close_to_reward") return { type: "close_to_reward", remaining: 2 };
    if (segment === "birthday_month") return { type: "birthday_month", month: new Date().getMonth() + 1 };
    if (segment === "saved_list" && listId) return { type: "saved_list", listId };
    return { type: "everyone" };
  };

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    void getListsFn().then((lists) => {
      if (cancelled) return;
      setListName(lists?.find((list) => list.id === listId)?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const countNow = async () => {
    setBusy(true);
    const result = await countRecipientsFn({ data: { audience: liveAudience() as never } });
    setBusy(false);
    if (result.ok) setCounts(result.counts);
    else setNotice(result.message);
  };

  const create = async () => {
    setBusy(true);
    const result = await createCampaignFn({
      data: {
        name,
        body,
        code: code.trim().toUpperCase(),
        audience: liveAudience() as never,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date(Date.now() + 60_000).toISOString(),
        segments,
        channel,
      },
    });
    setBusy(false);
    if (result.ok) {
      setDone(true);
      setNotice("Campaign scheduled. Its cost is held from your credit until it is sent.");
      await router.invalidate();
    } else {
      setNotice(result.message);
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="New campaign"
        title="Send an offer to your guests."
        intro="Offers go to guests who said yes to them. Texts end with a STOP line, and quiet hours move a send to 08:00."
      />
      <p className="demo-data-note">Step {step} of 3</p>
      {step === 1 && (
        <section className="builder-panel">
          <h2>Offer and wording</h2>
          <FormField label="Campaign name" hint="Only you see this name.">
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField label="Message" hint={`${body.length} of ${MESSAGE_MAX} characters, ${segments} ${segments === 1 ? "text" : "texts"} each. The STOP line is added for you.`}>
            <textarea value={body} maxLength={MESSAGE_MAX} onChange={(event) => setBody(event.target.value)} />
          </FormField>
          <FormField label="Campaign code" hint="3 to 12 letters or numbers. Guests show it at the till.">
            <input value={code} maxLength={12} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </FormField>
          <button className="builder-primary" onClick={() => setStep(2)} disabled={name.trim() === "" || body.trim() === "" || !CODE_PATTERN.test(code.trim().toUpperCase())}>
            Next: choose guests
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="builder-panel">
          <h2>Who gets it</h2>
          <FormField label="Audience">
            <select value={segment} onChange={(event) => { setSegment(event.target.value as SegmentType); setCounts(null); }}>
              {SEGMENT_CHOICES.filter((choice) => choice.type !== "saved_list" || (choice.type === "saved_list" && listId)).map((choice) => (
                <option key={choice.type} value={choice.type}>
                  {choice.type === "saved_list" ? `Your list${listName ? `: ${listName}` : ""}` : choice.title}
                </option>
              ))}
            </select>
          </FormField>
          {segment === "saved_list" && listName && <p className="demo-data-note">Your list: {listName}</p>}
          {segment === "weekday" && (
            <FormField label="Day">
              <select value={day} onChange={(event) => { setDay(Number(event.target.value)); setCounts(null); }}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, index) => (
                  <option key={label} value={index}>{label}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="How it goes out">
            <div className="cmp-options" role="radiogroup" aria-label="How it goes out">
              {CHANNEL_CHOICES.map((choice) => (
                <button
                  key={choice.channel}
                  type="button"
                  role="radio"
                  aria-checked={channel === choice.channel}
                  className={`cmp-option${channel === choice.channel ? " is-on" : ""}`}
                  onClick={() => setChannel(choice.channel)}
                >
                  <b>{choice.title}</b>
                  <span>{choice.hint}</span>
                </button>
              ))}
            </div>
          </FormField>
          <p className="demo-data-note">
            {counts === null || recipients === null
              ? "Count the guests this audience reaches before you continue."
              : channel === "both"
                ? `${countLabel(recipients, "guest")} can be reached: ${counts.push} by push, and a text only if the push fails (${counts.sms} guests can get a text).`
                : channel === "push"
                  ? `${countLabel(recipients, "guest")} will get this push notification.`
                  : `${countLabel(recipients, "guest")} will get this text.`}
          </p>
          <button className="builder-secondary" onClick={countNow} disabled={busy}>
            Count guests
          </button>{" "}
          <button className="builder-primary" onClick={() => setStep(3)} disabled={recipients === null || recipients === 0}>
            Next: review
          </button>
        </section>
      )}
      {step === 3 && !done && (
        <section className="builder-panel">
          <h2>Review and schedule</h2>
          <FormField label="Send time" hint="Leave empty to send in about a minute. Times in quiet hours move to 08:00.">
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </FormField>
          <ul>
            <li>Guests: {recipients ?? 0}</li>
            {channel !== "push" && <li>Texts each: {segments}</li>}
            <li>Cost held from credit: {formatRand(cost)}{channel === "push" ? " (push is free)" : ""}</li>
          </ul>
          <p className="demo-data-note">Only guests who said yes to offers are included. Guests who opted out or withdrew never get a text or a push.</p>
          <button className="builder-primary" onClick={create} disabled={busy}>
            Create campaign
          </button>
        </section>
      )}
      {done && <p className="demo-data-note" role="status"><a href="/app/campaigns">See your campaigns</a></p>}
      {notice && (
        <p className="cmp-warn" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const SEGMENT_CHOICES: Array<{ type: SegmentType; title: string; hint: string }> = [
  { type: "everyone", title: "Everyone opted in", hint: "Everyone who said yes to offers." },
  { type: "new", title: "New guests", hint: "Joined in the last 14 days." },
  { type: "lapsed30", title: "Lapsed 30+ days", hint: "No visit in a month. Best for win-backs." },
  { type: "close_to_reward", title: "Close to a reward", hint: "Within 2 stamps of a reward." },
  { type: "weekday", title: "Visited on a weekday", hint: "Pick the day that needs filling." },
  { type: "birthday_month", title: "Birthdays this month", hint: "Guests whose birthday falls in this month." },
  { type: "saved_list", title: "A saved list", hint: "A named list you built earlier." },
];

const STEPS = ["Offer", "Who", "How", "Review", "Send"] as const;

function ComposerPage() {
  const state = useDemoState();
  const navigate = useNavigate();
  const {
    listId: initialListId,
    segment: initialSegment,
    weekday: initialWeekday,
    body: initialBody,
    name: initialName,
  } = useSearch({
    from: "/app/campaigns/new",
  });
  const restaurantId = state.session.restaurantId;
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? "");
  const [segment, setSegment] = useState<SegmentType>(
    initialListId ? "saved_list" : (initialSegment ?? "everyone"),
  );
  // Push first, because it is free. SMS is a deliberate second choice.
  const [pushOn, setPushOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [onPage, setOnPage] = useState(true);
  const [atTill, setAtTill] = useState(false);
  const [weekday, setWeekday] = useState(initialWeekday ?? 3);
  const [listId, setListId] = useState(initialListId ?? "");
  const [body, setBody] = useState(
    initialBody ?? "Hi {first_name}, we miss you! Pop by this week.",
  );
  const [code, setCode] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState("");
  const [newListName, setNewListName] = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const [editingName, setEditingName] = useState("");
  const [previewChannel, setPreviewChannel] = useState<"sms" | "push">("push");

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>New campaign.</h1>
        <p className="demo-intro">Choose a venue first, then open this page again.</p>
      </main>
    );
  }
  const savedLists = api.audience.lists(restaurant.id);
  // The saved-list card shows the list's own size, not the opted-in subset.
  const selectedList = savedLists.find((list) => list.id === listId);
  const audience: CampaignAudience =
    segment === "saved_list"
      ? { type: "saved_list", listId }
      : segment === "weekday"
        ? { type: "weekday", weekday }
        : segment === "birthday_month"
          ? { type: "birthday_month" }
          : segment === "new"
            ? { type: "new", days: 14 }
            : segment === "lapsed30"
              ? { type: "lapsed30", days: 30 }
              : segment === "close_to_reward"
                ? { type: "close_to_reward", remaining: 2 }
                : { type: "everyone" };
  const channel: "push" | "sms" | "push_then_sms" | "none" =
    pushOn && smsOn ? "push_then_sms" : pushOn ? "push" : smsOn ? "sms" : "none";
  const pushEligible = pushOn ? eligiblePushMemberships(state, restaurant.id, audience) : [];
  const pushIds = new Set(pushEligible.map((membership) => membership.id));
  const smsEligible = smsOn
    ? eligibleMemberships(state, restaurant.id, audience).filter(
        (membership) => channel !== "push_then_sms" || !pushIds.has(membership.id),
      )
    : [];
  const eligible = [...pushEligible, ...smsEligible];
  const rawCount = api.audience.count(restaurant.id, audience);
  const fillFacts = messageFillFacts(restaurant.id);
  const sampleName =
    state.customers.find((c) => c.id === eligible[0]?.customerId)?.name.split(" ")[0] ?? "friend";
  const segments = messageSegments(applyFillIns(body || "Hi", fillFacts, sampleName), sampleName);
  const creditResult = api.credit.list(restaurant.id);
  const balance = creditResult.ok ? creditResult.data.balanceCents : 0;
  const warnings = checkCopy(body);
  const suggestions = suggestMessages({ restaurant, audience, facts: fillFacts });

  const save = (nextStep: number) => {
    if (segment === "saved_list" && !listId) {
      setNotice("Choose a saved list, or build one from a segment.");
      return;
    }
    if (!body.trim()) {
      setNotice("Write the offer before going on.");
      return;
    }
    if (channel === "none") {
      setNotice("Turn on push or SMS so the offer reaches someone.");
      return;
    }
    const saved = api.campaign.saveDraft({
      restaurantId: restaurant.id,
      actor: "owner",
      actorRole: state.session.role,
      ...(draftId ? { draftId } : {}),
      fields: {
        name: name || "Untitled offer",
        body,
        audience,
        channel,
        placements: { page: onPage, till: atTill, push: pushOn, sms: smsOn },
        ...(code ? { code } : {}),
        ...(validFrom ? { validFrom } : {}),
        ...(validTo ? { validTo } : {}),
      },
    });
    if (!saved.ok) {
      setNotice(saved.error.message);
      return;
    }
    setDraftId(saved.data.id);
    if (saved.data.code) setCode(saved.data.code);
    setStep(nextStep);
    setNotice("");
  };

  const confirm = () => {
    if (!draftId) return;
    if (eligible.length > 200 && typed.trim().toUpperCase() !== "SEND") {
      setNotice("Type SEND to confirm a send to more than 200 guests.");
      return;
    }
    const confirmed = api.campaign.confirm({
      campaignId: draftId,
      actor: "owner",
      ...(sendNow ? { sendNow: true as const } : {}),
      ...(!sendNow && scheduledAt ? { scheduledAt } : {}),
    });
    if (!confirmed.ok) {
      setNotice(confirmed.error.message);
      return;
    }
    void navigate({ to: "/app/campaigns/$campaignId", params: { campaignId: draftId } });
  };

  const createListFromSegment = () => {
    const created = api.audience.listFromSegment({
      restaurantId: restaurant.id,
      name: newListName || `Segment ${new Date().toLocaleDateString("en-ZA")}`,
      audience,
    });
    if (!created.ok) {
      setNotice(created.error.message);
      return;
    }
    setNotice(`Saved “${created.data.name}” with ${countLabel(created.data.membershipIds.length, "guest")}.`);
    setNewListName("");
    setListId(created.data.id);
    setSegment("saved_list");
  };

  const startEditingList = (id: string) => {
    const list = savedLists.find((item) => item.id === id);
    if (!list) return;
    setEditingListId(id);
    setEditingIds(list.membershipIds);
    setEditingName(list.name);
  };

  const saveEditingList = () => {
    if (!editingListId) return;
    const saved = api.audience.saveList({
      id: editingListId,
      restaurantId: restaurant.id,
      name: editingName,
      membershipIds: editingIds,
    });
    setNotice(saved.ok ? "List saved." : saved.error.message);
    if (saved.ok) setEditingListId(null);
  };

  const preview = applyFillIns(body, fillFacts, sampleName);
  const short = balance < smsEligible.length * segments * 35;
  const back =
    step > 1 ? (
      <button className="cmp-back" onClick={() => setStep(step - 1)}>
        ← Back
      </button>
    ) : null;

  return (
    <main className="demo-hub page-width cmp">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · New campaign
      </p>
      <h1>One campaign, start to send.</h1>
      <PublishSteps step={step} labels={STEPS} />

      {step === 1 && (
        <section className="cmp-card">
          <h2>What is the offer?</h2>
          <label className="builder-field">
            Name it for yourself
            <input
              value={name}
              placeholder="e.g. Tuesday pasta night"
              onChange={(event) => setName(event.target.value)}
            />
            <small>Guests never see this name. It is how you find the offer later.</small>
          </label>
          {suggestions.length > 0 && (
            <div className="cmp-suggest">
              <p className="cmp-suggest-head">
                <strong>Suggested wording</strong>
                <span>Built from real data. Tap to use, then edit as much as you like.</span>
              </p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="cmp-suggest-card"
                  onClick={() => setBody(suggestion.body)}
                >
                  <b>{suggestion.title}</b>
                  <span>{suggestion.note}</span>
                  <small>{applyFillIns(suggestion.body, fillFacts, sampleName)}</small>
                </button>
              ))}
            </div>
          )}
          <label className="builder-field">
            The words guests read
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
            <small>
              Use {"{first_name}"}, {"{favourite_item}"}, {"{usual_day}"} or {"{reward}"} to personalise. Anything you
              leave out is filled from the guest's data, or with safe wording. The STOP line is
              added for you.
            </small>
          </label>
          {warnings.map((warning) => (
            <p className="cmp-warn" key={warning.kind}>
              {warning.message}{" "}
              {warning.fixable && <button onClick={() => setBody(fixCopy(body))}>Fix it for me</button>}
            </p>
          ))}
          <div className="cmp-row">
            <label className="builder-field">
              Offer code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Auto"
              />
              <small>Shown at the till. Leave blank and we make one.</small>
            </label>
            <label className="builder-field">
              Valid from
              <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
            </label>
            <label className="builder-field">
              Valid to
              <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
            </label>
          </div>
          <button className="builder-primary" onClick={() => save(2)}>
            Continue
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="cmp-card">
          {back}
          <h2>Who should get it?</h2>
          <div className="cmp-options" role="radiogroup" aria-label="Audience segment">
            {SEGMENT_CHOICES.map((choice) => (
              <button
                key={choice.type}
                type="button"
                role="radio"
                aria-checked={segment === choice.type}
                className={`cmp-option${segment === choice.type ? " is-on" : ""}`}
                onClick={() => setSegment(choice.type)}
              >
                <b>{choice.title}</b>
                <span>{choice.hint}</span>
                <strong>
                  {choice.type === "saved_list" ? (
                    selectedList ? countLabel(selectedList.membershipIds.length, "guest") : "Choose a list"
                  ) : (
                    countLabel(
                      segment === choice.type
                        ? rawCount
                        : api.audience.count(restaurant.id, segmentAudience(choice.type, weekday, listId)),
                      "guest",
                    )
                  )}
                </strong>
              </button>
            ))}
          </div>
          {segment === "weekday" && (
            <label className="builder-field">
              Which weekday?
              <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                  (day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          {segment === "saved_list" && (
            <label className="builder-field">
              Saved list
              <select value={listId} onChange={(event) => setListId(event.target.value)}>
                <option value="">Choose a list…</option>
                {savedLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} · {list.membershipIds.length}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="live-count" role="status">
            <strong>{countLabel(rawCount, "guest")}</strong> in this group.
          </div>

          <details className="saved-lists">
            <summary>Saved lists ({savedLists.length})</summary>
            <p className="gx-note">
              Save a segment now, then edit it later by ticking guests. Saved lists can be reused
              in any offer.
            </p>
            <div className="saved-list-create">
              <input
                value={newListName}
                placeholder="Name this list, e.g. Friday regulars"
                onChange={(event) => setNewListName(event.target.value)}
              />
              <button className="builder-secondary" onClick={createListFromSegment}>
                Save current segment
              </button>
            </div>
            {savedLists.map((list) => (
              <div className="saved-list-row" key={list.id}>
                <div>
                  <strong>{list.name}</strong>
                  <small>{list.membershipIds.length} guests</small>
                </div>
                <button
                  className="builder-secondary"
                  onClick={() => {
                    setListId(list.id);
                    setSegment("saved_list");
                  }}
                >
                  Use
                </button>
                <button className="guest-back" onClick={() => startEditingList(list.id)}>
                  Edit
                </button>
              </div>
            ))}
            {editingListId && (
              <div className="list-editor">
                <label className="builder-field">
                  List name
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                </label>
                <div className="list-editor-guests">
                  {state.memberships
                    .filter((membership) => membership.restaurantId === restaurant.id)
                    .map((membership) => {
                      const customer = state.customers.find((item) => item.id === membership.customerId);
                      return (
                        <label key={membership.id} className="list-editor-guest">
                          <input
                            type="checkbox"
                            checked={editingIds.includes(membership.id)}
                            onChange={(event) =>
                              setEditingIds((current) =>
                                event.target.checked
                                  ? [...current, membership.id]
                                  : current.filter((id) => id !== membership.id),
                              )
                            }
                          />
                          {customer?.name || "(removed)"}
                        </label>
                      );
                    })}
                </div>
                <div className="page-actions">
                  <button className="builder-primary" onClick={saveEditingList}>
                    Save list
                  </button>
                  <button className="guest-back" onClick={() => setEditingListId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </details>
          <button className="builder-primary" onClick={() => save(3)}>
            Continue
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="cmp-card">
          {back}
          <h2>How should it reach them?</h2>
          <div className="switch-list">
            <Switch
              checked={pushOn}
              onChange={setPushOn}
              label="Push notification"
              hint="Free, instant, and only to guests who turned notifications on."
            />
            <Switch
              checked={smsOn}
              onChange={setSmsOn}
              label="SMS"
              hint="Goes to every opted-in guest. Charged from your credit, R0.35 a segment."
            />
            <Switch
              checked={onPage}
              onChange={setOnPage}
              label="Show on your guest page"
              hint="Guests can find the offer when they open your page, even if they get no message."
            />
            <Switch
              checked={atTill}
              onChange={setAtTill}
              label="Usable at the till"
              hint="Staff can put the code through at the counter."
            />
          </div>
          <div className="live-count" role="status">
            <strong>{eligible.length}</strong> guests will hear about it · {pushEligible.length} push /{" "}
            {smsEligible.length} SMS.
            {channel === "push_then_sms" ? " SMS only goes to guests without push." : ""}
          </div>
          {channel === "none" && (
            <p className="cmp-warn">Turn on push or SMS, or nobody gets the offer.</p>
          )}
          <button className="builder-primary" onClick={() => save(4)}>
            Continue
          </button>
        </section>
      )}

      {step === 4 && (
        <section className="cmp-card">
          {back}
          <h2>Review and cost</h2>
          <div className="cmp-options" role="radiogroup" aria-label="Preview channel">
            <button
              type="button"
              role="radio"
              aria-checked={previewChannel === "sms"}
              className={`cmp-option${previewChannel === "sms" ? " is-on" : ""}`}
              onClick={() => setPreviewChannel("sms")}
            >
              <b>Show the SMS</b>
              <span>Exactly the text a guest reads, with its length and cost.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={previewChannel === "push"}
              className={`cmp-option${previewChannel === "push" ? " is-on" : ""}`}
              onClick={() => setPreviewChannel("push")}
            >
              <b>Show the push</b>
              <span>The notification a guest sees on their phone. Free to send.</span>
            </button>
          </div>
          {previewChannel === "sms" ? (
            <SmsPreview
              sender={restaurant.senderName}
              body={body}
              sampleName={sampleName}
              recipients={smsEligible.length}
            />
          ) : (
            <PushPreview
              sender={restaurant.name}
              title={name || "A treat from us"}
              body={preview}
              recipients={pushEligible.length}
            />
          )}
          <PreviewOnly>
            Preview only, nothing was sent. Guests get this after you press Publish on the last step.
          </PreviewOnly>
          <div className="cmp-tiles">
            <div>
              <small>Guests</small>
              <strong>{eligible.length}</strong>
            </div>
            <div>
              <small>SMS segments</small>
              <strong>{segments}</strong>
            </div>
            <div className={short ? "is-bad" : ""}>
              <small>Your credit</small>
              <strong>{zar(balance)}</strong>
            </div>
          </div>
          <p className={short ? "cmp-warn" : "cmp-note"}>
            {costPreview({ recipients: smsEligible.length, segments, creditCents: balance })}
          </p>
          <p className="cmp-note">
            The estimate is held from your credit when you confirm. You are only charged for
            messages actually sent. Push costs nothing.
          </p>
          <button className="builder-primary" onClick={() => save(5)}>
            Continue
          </button>
        </section>
      )}

      {step === 5 && (
        <section className="cmp-card">
          {back}
          <h2>Send it?</h2>
          <p className="cmp-note">
            {api.audience.label(audience)}. {pushEligible.length} push recipients and {smsEligible.length} SMS
            recipients. {smsEligible.length > 0 ? `${zar(smsEligible.length * segments * 35)} from credit.` : "Nothing charged."}
          </p>
          <div className="cmp-options" role="radiogroup" aria-label="When">
            <button
              type="button"
              role="radio"
              aria-checked={sendNow}
              className={`cmp-option${sendNow ? " is-on" : ""}`}
              onClick={() => setSendNow(true)}
            >
              <b>Send now</b>
              <span>Goes out straight away, outside quiet hours (20:00 to 08:00).</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!sendNow}
              className={`cmp-option${!sendNow ? " is-on" : ""}`}
              onClick={() => setSendNow(false)}
            >
              <b>Schedule</b>
              <span>Pick a time. Sends inside quiet hours move to 08:00.</span>
            </button>
          </div>
          {!sendNow && (
            <label className="builder-field">
              When
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          )}
          {eligible.length > 200 && (
            <label className="builder-field">
              Type SEND to confirm ({eligible.length} recipients)
              <input value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
          )}
          <button className="builder-primary" onClick={confirm}>
            Publish and {sendNow ? "send" : "schedule"}
          </button>
        </section>
      )}
      {notice && (
        <p className="cmp-warn" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}

function segmentAudience(type: SegmentType, weekday: number, listId: string): CampaignAudience {
  if (type === "saved_list") return { type: "saved_list", listId };
  if (type === "weekday") return { type: "weekday", weekday };
  if (type === "birthday_month") return { type: "birthday_month" };
  if (type === "new") return { type: "new", days: 14 };
  if (type === "lapsed30") return { type: "lapsed30", days: 30 };
  if (type === "close_to_reward") return { type: "close_to_reward", remaining: 2 };
  return { type: "everyone" };
}
