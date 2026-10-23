import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { CampaignAudience, SpecialKind, TierName } from "@/data/types";

export const Route = createFileRoute("/app/specials")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: SpecialsPage,
});

const KIND_COPY: Record<SpecialKind, string> = {
  public: "Visible to everyone, one shared code.",
  members: "Only members at this venue, one shared code for all of them.",
  targeted: "Sent to a chosen segment; every recipient gets a unique single-use code.",
};

const human = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));

function SpecialsPage() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const rows = api.special.ownerList(restaurant.id);
  const [kind, setKind] = useState<SpecialKind>("public");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [code, setCode] = useState("");
  const [minTier, setMinTier] = useState<TierName | "">("");
  const [segment, setSegment] = useState("everyone");
  const [listId, setListId] = useState("");
  const [startsAt, setStartsAt] = useState(
    new Date(state.now).toISOString().slice(0, 10),
  );
  const [endsAt, setEndsAt] = useState(
    new Date(state.now + 21 * 86400000).toISOString().slice(0, 10),
  );
  const [notice, setNotice] = useState("");

  const lists = api.audience.lists(restaurant.id);
  const targetAudience: CampaignAudience =
    segment === "saved_list"
      ? { type: "saved_list", listId }
      : segment === "lapsed30"
        ? { type: "lapsed30", days: 30 }
        : segment === "close_to_reward"
          ? { type: "close_to_reward", remaining: 2 }
          : { type: "everyone" };
  const targetMembers = api.audience.members(state, restaurant.id, targetAudience);
  const redemptions = state.redemptions
    .filter((item) => item.restaurantId === restaurant.id && item.kind === "special")
    .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
    .slice(0, 8);

  const create = () => {
    setNotice("");
    const result =
      kind === "targeted"
        ? api.special.create({
            restaurantId: restaurant.id,
            title,
            body,
            kind,
            startsAt: new Date(`${startsAt}T08:00:00`).toISOString(),
            endsAt: new Date(`${endsAt}T22:00:00`).toISOString(),
            targetMembershipIds: targetMembers.map((membership) => membership.id),
          })
        : api.special.create({
            restaurantId: restaurant.id,
            title,
            body,
            kind,
            startsAt: new Date(`${startsAt}T08:00:00`).toISOString(),
            endsAt: new Date(`${endsAt}T22:00:00`).toISOString(),
            ...(code ? { code } : {}),
            ...(kind === "members" && minTier ? { minTier } : {}),
          });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(
      kind === "targeted"
        ? `Saved. ${targetMembers.length} personal codes issued.`
        : `Saved with shared code ${result.data.code}.`,
    );
    setTitle("");
    setBody("");
    setCode("");
  };

  const issueMore = (specialId: string) => {
    const result = api.special.issueCodes(
      specialId,
      targetMembers.map((membership) => membership.id),
    );
    setNotice(
      result.ok
        ? `${result.data.length} new code${result.data.length === 1 ? "" : "s"} issued.`
        : result.error.message,
    );
  };

  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · Specials
      </p>
      <h1>Offers with a code.</h1>
      <p className="demo-intro">
        Public offers anyone can see, members-only offers for your regulars, and targeted offers
        with a personal code for every guest.
      </p>

      <section className="builder-panel">
        <h2>Create a special</h2>
        <div className="kind-picker" role="radiogroup" aria-label="Special kind">
          {(["public", "members", "targeted"] as SpecialKind[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              className={`kind-option${kind === option ? " is-on" : ""}`}
              onClick={() => setKind(option)}
            >
              <strong>{option === "public" ? "Public" : option === "members" ? "Members" : "Targeted"}</strong>
              <small>{KIND_COPY[option]}</small>
            </button>
          ))}
        </div>
        <div className="builder-fields">
          <label className="builder-field">
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="builder-field">
            Details
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
          </label>
          {kind !== "targeted" ? (
            <label className="builder-field">
              Shared code (leave blank to generate)
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Auto"
              />
            </label>
          ) : (
            <>
              <label className="builder-field">
                Who gets a code?
                <select
                  value={segment}
                  onChange={(event) => setSegment(event.target.value)}
                >
                  <option value="everyone">Everyone opted in</option>
                  <option value="lapsed30">Lapsed 30+ days</option>
                  <option value="close_to_reward">Close to a reward</option>
                  <option value="saved_list">A saved list</option>
                </select>
              </label>
              {segment === "saved_list" && (
                <label className="builder-field">
                  Saved list
                  <select value={listId} onChange={(event) => setListId(event.target.value)}>
                    <option value="">Choose…</option>
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} · {list.membershipIds.length}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="live-count" role="status">
                <strong>{targetMembers.length}</strong> guests will get a unique code.
              </p>
            </>
          )}
          {kind === "members" && (
            <label className="builder-field">
              Minimum tier
              <select
                value={minTier}
                onChange={(event) => setMinTier(event.target.value as TierName | "")}
              >
                <option value="">Any member</option>
                <option value="regular">Regular and above</option>
                <option value="vip">VIP only</option>
              </select>
            </label>
          )}
          <label className="builder-field">
            Starts
            <input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="builder-field">
            Ends
            <input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
        </div>
        <div className="page-actions">
          <button className="builder-primary" onClick={create}>
            Create special
          </button>
        </div>
        {notice && (
          <p role="status" className="demo-data-note">
            {notice}
          </p>
        )}
      </section>

      <section className="builder-panel">
        <h2>Your specials</h2>
        {rows.length === 0 && <p className="demo-data-note">No specials yet.</p>}
        {rows.map(({ special, status, issued, redeemed }) => (
          <article className="special-row" key={special.id}>
            <div>
              <div className="special-pills">
                <span className={`status-pill ${status}`}>{status}</span>
                <span className="kind-pill">{special.kind}</span>
              </div>
              <strong>{special.title}</strong>
              <small>
                {human(special.startsAt)} – {human(special.endsAt)}
                {special.code ? ` · Shared code ${special.code}` : ""}
                {special.minTier ? ` · ${special.minTier}+` : ""}
              </small>
              <small>
                {special.kind === "targeted" ? `${issued} codes issued` : "Shared code"} ·{" "}
                {redeemed} redeemed
              </small>
            </div>
            <div className="special-row-actions">
              {special.kind === "targeted" && (
                <button className="builder-secondary" onClick={() => issueMore(special.id)}>
                  Issue to segment
                </button>
              )}
              <button
                className="guest-back"
                onClick={() => {
                  const result = api.special.update({
                    id: special.id,
                    restaurantId: restaurant.id,
                    title: special.title,
                    body: special.body,
                    startsAt: special.startsAt,
                    endsAt: special.endsAt,
                    kind: special.kind,
                    active: !special.active,
                    ...(special.minTier ? { minTier: special.minTier } : {}),
                  });
                  setNotice(result.ok ? "Special updated." : result.error.message);
                }}
              >
                {special.active ? "Pause" : "Resume"}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="builder-panel">
        <h2>Recent redemptions</h2>
        {redemptions.length === 0 && (
          <p className="demo-data-note">Nothing redeemed yet. Codes are checked at the till.</p>
        )}
        {redemptions.map((redemption) => {
          const special = state.specials.find((item) => item.id === redemption.specialId);
          const membership = state.memberships.find((item) => item.id === redemption.membershipId);
          const customer = state.customers.find((item) => item.id === membership?.customerId);
          return (
            <div className="outbox-meta" key={redemption.id}>
              <span>
                <strong>{special?.title ?? "Special"}</strong> · {customer?.name ?? "Guest"}
              </span>
              <span>
                {redemption.code} · {human(redemption.redeemedAt)}
              </span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
