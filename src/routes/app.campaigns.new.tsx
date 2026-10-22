import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
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
import type { CampaignAudience, SegmentType } from "@/data/types";

export const Route = createFileRoute("/app/campaigns/new")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  validateSearch: (search: Record<string, unknown>) => ({ listId: typeof search["listId"] === "string" ? search["listId"] : undefined }),
  component: ComposerPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const SEGMENT_CHOICES: Array<{ type: SegmentType; title: string; hint: string }> = [
  { type: "everyone", title: "Everyone opted in", hint: "Everyone who said yes to SMS offers." },
  { type: "new", title: "New guests", hint: "Joined in the last 14 days." },
  { type: "lapsed30", title: "Lapsed 30+ days", hint: "No visit in a month. Best for win-backs." },
  { type: "close_to_reward", title: "Close to a reward", hint: "Within 2 stamps of a reward." },
  { type: "weekday", title: "Visited on a weekday", hint: "Pick the day that needs filling." },
  { type: "saved_list", title: "A saved list", hint: "A named list you built earlier." },
];

function ComposerPage() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const navigate = useNavigate();
  const { listId: initialListId } = useSearch({ from: "/app/campaigns/new" });
  const restaurantId = state.session.restaurantId;
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<SegmentType>(initialListId ? "saved_list" : "everyone");
  const [channel, setChannel] = useState<"sms" | "push" | "push_then_sms">("sms");
  const [weekday, setWeekday] = useState(3);
  const [listId, setListId] = useState(initialListId ?? "");
  const [specialId, setSpecialId] = useState("");
  const [body, setBody] = useState("Hi {first_name}, we miss you! Pop by this week.");
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

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>New campaign.</h1>
        <p className="demo-intro">Open this page from a restaurant tunnel.</p>
      </main>
    );
  }
  const savedLists = api.audience.lists(restaurant.id);
  const specials = api.special.ownerList(restaurant.id);
  const audience: CampaignAudience =
    segment === "saved_list"
      ? { type: "saved_list", listId }
      : segment === "weekday"
        ? { type: "weekday", weekday }
        : segment === "new"
          ? { type: "new", days: 14 }
          : segment === "lapsed30"
            ? { type: "lapsed30", days: 30 }
            : segment === "close_to_reward"
              ? { type: "close_to_reward", remaining: 2 }
              : { type: "everyone" };
  const pushEligible = channel === "sms" ? [] : eligiblePushMemberships(state, restaurant.id, audience);
  const pushIds = new Set(pushEligible.map((membership) => membership.id));
  const smsEligible = channel === "push" ? [] : eligibleMemberships(state, restaurant.id, audience).filter((membership) => channel !== "push_then_sms" || !pushIds.has(membership.id));
  const eligible = [...pushEligible, ...smsEligible];
  const rawCount = api.audience.count(restaurant.id, audience);
  const sampleName =
    state.customers.find((c) => c.id === eligible[0]?.customerId)?.name.split(" ")[0] ?? "friend";
  const segments = messageSegments(body || "Hi", sampleName);
  const creditResult = api.credit.list(restaurant.id);
  const balance = creditResult.ok ? creditResult.data.balanceCents : 0;
  const warnings = checkCopy(body);
  const selectedSpecial = specials.find((row) => row.special.id === specialId)?.special;

  const save = (nextStep: number) => {
    if (segment === "saved_list" && !listId) {
      setNotice("Choose a saved list, or build one from a segment.");
      return;
    }
    const saved = api.campaign.saveDraft({
      restaurantId: restaurant.id,
      actor: "owner",
      actorRole: state.session.role,
      ...(draftId ? { draftId } : {}),
      fields: {
        name: name || "Untitled campaign",
        body,
        audience,
        channel,
        ...(code ? { code } : {}),
        ...(specialId ? { specialId } : {}),
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
    setNotice(`Saved “${created.data.name}” with ${created.data.membershipIds.length} guests.`);
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

  const preview = body.replaceAll("{first_name}", sampleName);
  const short = balance < costPreviewCents(smsEligible.length, segments);
  const steps = ["Audience", "Message", "Cost", "Confirm"];
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
      <h1>Bring them back.</h1>
      <ol className="cmp-steps" aria-label={`Step ${step} of 4`}>
        {steps.map((label, index) => (
          <li
            key={label}
            className={index + 1 === step ? "is-now" : index + 1 < step ? "is-done" : ""}
          >
            <i>{index + 1 < step ? "✓" : index + 1}</i>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="cmp-card">
          <h2>Who should hear from you?</h2>
          <label className="builder-field">
            Campaign name
            <input
              value={name}
              placeholder="e.g. We miss you"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className="campaign-channel-picker">
            <legend>Send by</legend>
            {([
              ["push", "Push only"],
              ["sms", "SMS only"],
              ["push_then_sms", "Push first, then SMS without push"],
            ] as const).map(([value, label]) => (
              <label key={value}><input type="radio" name="campaign-channel" checked={channel === value} onChange={() => setChannel(value)} />{label}</label>
            ))}
            <p>{pushEligible.length} push recipients · {smsEligible.length} SMS recipients. Push is free; SMS only is charged from credit.</p>
          </fieldset>
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
                  {segment === choice.type ? rawCount : api.audience.count(restaurant.id, segmentAudience(choice.type, weekday, listId))}{" "}
                  guests
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
            <strong>{eligible.length}</strong> eligible guests · {pushEligible.length} push / {smsEligible.length} SMS.
          </div>

          <details className="saved-lists">
            <summary>Saved lists ({savedLists.length})</summary>
            <p className="gx-note">
              Save a segment now, then edit it later by ticking guests. Saved lists can be reused
              in any campaign.
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
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                </label>
                <div className="list-editor-guests">
                  {state.memberships
                    .filter((membership) => membership.restaurantId === restaurant.id)
                    .map((membership) => {
                      const customer = state.customers.find(
                        (item) => item.id === membership.customerId,
                      );
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
          <button className="builder-primary" onClick={() => save(2)}>
            Continue
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="cmp-card">
          {back}
          <h2>What do you want to say?</h2>
          <label className="builder-field">
            Your message
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
            <small>
              Use {"{first_name}"} to personalise. The STOP line is added for you.
            </small>
          </label>
          <div className="cmp-meter">
            <span>
              {segments} SMS segment{segments === 1 ? "" : "s"} × {smsEligible.length} SMS guests
            </span>
            <span>{pushEligible.length} push · {smsEligible.length} SMS recipients</span>
          </div>
          {warnings.map((warning) => (
            <p className="cmp-warn" key={warning.kind}>
              {warning.message}{" "}
              {warning.fixable && (
                <button onClick={() => setBody(fixCopy(body))}>Fix it for me</button>
              )}
            </p>
          ))}
          <div className="cmp-phone" aria-label="Message preview">
            <small>Preview · {restaurant.name}</small>
            <p>
              {preview}
              <br />
              <span>Reply STOP to opt out.</span>
              {selectedSpecial?.kind === "targeted" && (
                <>
                  <br />
                  <span>Your code: {"{unique code}"}</span>
                </>
              )}
            </p>
          </div>
          <label className="builder-field">
            Attach a special (optional)
            <select value={specialId} onChange={(event) => setSpecialId(event.target.value)}>
              <option value="">No special</option>
              {specials.map(({ special }) => (
                <option key={special.id} value={special.id}>
                  {special.title} · {special.kind}
                </option>
              ))}
            </select>
            <small>
              {selectedSpecial?.kind === "targeted"
                ? "Each recipient gets their own single-use code."
                : selectedSpecial
                  ? `Shared code ${selectedSpecial.code}. One redemption per member.`
                  : "Public and members specials use one shared code; targeted specials are personal."}
            </small>
          </label>
          <div className="cmp-row">
            <label className="builder-field">
              Offer code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Auto"
              />
            </label>
            <label className="builder-field">
              Valid from
              <input
                type="date"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
              />
            </label>
            <label className="builder-field">
              Valid to
              <input
                type="date"
                value={validTo}
                onChange={(event) => setValidTo(event.target.value)}
              />
            </label>
          </div>
          <button className="builder-primary" onClick={() => save(3)}>
            Continue
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="cmp-card">
          {back}
          <h2>What it will cost</h2>
          <div className="cmp-tiles">
            <div>
              <small>Guests</small>
              <strong>{eligible.length}</strong>
            </div>
            <div>
              <small>Segments each</small>
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
            messages actually sent.
          </p>
          <button className="builder-primary" onClick={() => save(4)}>
            Continue
          </button>
        </section>
      )}

      {step === 4 && (
        <section className="cmp-card">
          {back}
          <h2>Ready to send?</h2>
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
          <p className="cmp-note">
            Audience: {api.audience.label(audience)}. {pushEligible.length} push recipients and {smsEligible.length} SMS recipients.
          </p>
          {eligible.length > 200 && (
            <label className="builder-field">
              Type SEND to confirm ({eligible.length} recipients)
              <input value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
          )}
          <button className="builder-primary" onClick={confirm}>
            Confirm and {sendNow ? "send" : "schedule"}
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
  if (type === "new") return { type: "new", days: 14 };
  if (type === "lapsed30") return { type: "lapsed30", days: 30 };
  if (type === "close_to_reward") return { type: "close_to_reward", remaining: 2 };
  return { type: "everyone" };
}

const SEGMENT_CENTS = 35;
function costPreviewCents(recipients: number, segments: number) {
  return recipients * segments * SEGMENT_CENTS;
}
