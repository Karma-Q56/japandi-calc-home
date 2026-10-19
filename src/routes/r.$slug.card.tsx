import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { getCardFn, getDataModeFn } from "@/server/live";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { ThemeProvider } from "@/theme";
import { LoyaltyCard } from "@/components/patron/LoyaltyCard";
import { GuestShell } from "@/components/patron/GuestShell";
import { qrSvg } from "@/lib/qr";
import { rewardEarned, rewardProgress } from "@/lib/reward-copy";

export const Route = createFileRoute("/r/$slug/card")({
  validateSearch: (search) => cardSearchSchema.parse(search),
  loader: async ({ params, location }) => {
    const { mode } = await getDataModeFn();
    const raw = (location.search ?? {}) as { customerId?: unknown };
    const customerId = typeof raw.customerId === "string" ? raw.customerId : undefined;
    if (mode !== "live" || !customerId) return { mode, live: null };
    const { card } = await getCardFn({ data: { slug: params.slug, customerId } });
    return { mode, live: card };
  },
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    // Live mode has no demo session; the card is scoped by RLS instead.
    if (mode === "live") return;
    if (!requireRole("guest")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
    if (typeof window !== "undefined" && !demoRepo.read().session.customerId) {
      throw redirect({ to: "/demo" });
    }
  },
  component: GuestCard,
});

function GuestCard() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const state = useDemoState();
  const customerId = state.session.customerId;
  const result = customerId ? api.member.card(slug, customerId) : null;
  const [rewardOpen, setRewardOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [optoutUrl, setOptoutUrl] = useState("");

  const membershipId = result?.ok ? result.data.membership.id : null;
  useEffect(() => {
    if (membershipId) api.member.markSeen(membershipId);
  }, [membershipId]);

  if (loaderData.live) return <LiveGuestCard slug={slug} card={loaderData.live} />;

  if (!customerId) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No guest session yet.</h1>
          <p>Open the demo hub to pick a guest tunnel first.</p>
          <a className="builder-primary" href="/demo">
            Back to demo hub
          </a>
        </section>
      </main>
    );
  }
  if (!result?.ok) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No card yet.</h1>
          <p>Join this restaurant to see your card here.</p>
          <a className="builder-primary" href={`/r/${slug}/join`}>
            Join the card
          </a>
          <p>
            <a href="/demo">Back to demo hub</a>
          </p>
        </section>
      </main>
    );
  }
  const { restaurant, customer, membership, rewards, offers, visits, consents, stampsGained } =
    result.data;
  const openReward = rewards.find((item) => item.id === rewardOpen);
  const tokenUrl =
    typeof window === "undefined"
      ? "https://example.test/s/demo"
      : `${window.location.origin}/s/${customer.qrToken}`;
  const stampsLeft = restaurant.stampsRequired - membership.stampsCurrent;

  const waiting = rewards.filter((item) => !item.redeemedAt);
  return (
    <ThemeProvider theme={restaurant.theme}>
      <GuestShell back={{ to: "/me", label: "My cards" }}>
        <LoyaltyCard
          theme={restaurant.theme}
          name={restaurant.name}
          memberName={customer.name}
          filled={membership.stampsCurrent}
          total={restaurant.stampsRequired}
          newlyGained={stampsGained}
          footnote={rewardProgress(stampsLeft, restaurant.rewardDescription)}
        />
        {stampsGained > 0 && (
          <p className="gx-note" role="status">
            {stampsGained} new {stampsGained === 1 ? "stamp" : "stamps"} since your last visit.
          </p>
        )}
        <section className="gx-panel gx-code">
          <h2>Show this at the till</h2>
          <div className="member-qr" dangerouslySetInnerHTML={{ __html: qrSvg(tokenUrl) }} />
          <strong>{customer.memberCode}</strong>
          <small className="gx-note">Staff scan it or type the code. Demo data.</small>
        </section>
          <section className="gx-panel">
            <div className="guest-section-heading">
              <h2>Rewards waiting</h2>
              <span>{rewards.filter((item) => !item.redeemedAt).length}</span>
            </div>
            {rewards.filter((item) => !item.redeemedAt).length ? (
              rewards
                .filter((item) => !item.redeemedAt)
                .map((reward) => (
                  <article className="guest-list-item" key={reward.id}>
                    <span>
                      <strong>{rewardEarned(reward.description)}</strong>
                      <small>
                        Earned{" "}
                        {new Intl.DateTimeFormat("en-ZA", {
                          dateStyle: "medium",
                        }).format(new Date(reward.earnedAt))}
                      </small>
                    </span>
                    <button onClick={() => setRewardOpen(reward.id)}>Show to staff</button>
                  </article>
                ))
            ) : (
              <p className="demo-data-note">
                Keep collecting stamps. Your rewards will show up here.
              </p>
            )}
          </section>
          <section className="gx-panel">
            <h2>Offers for you</h2>
            {offers.map((offer) => (
              <article className="guest-list-item" key={offer.id}>
                <span>
                  <strong>{offer.name}</strong>
                  <small>{offer.body}</small>
                  <small>
                    Code {offer.code} · Expires{" "}
                    {new Intl.DateTimeFormat("en-ZA", {
                      dateStyle: "medium",
                    }).format(new Date(new Date(offer.sentAt ?? offer.createdAt).getTime() + 30 * 86400000))}
                  </small>
                </span>
                <button onClick={() => setNotice(`Show code ${offer.code} to the team.`)}>
                  Show to staff
                </button>
              </article>
            ))}
          </section>
          <section className="gx-panel guest-shortcuts">
            <a href={`/r/${slug}`}>View menu &amp; specials</a>
            <a href="/me">See all my cards</a>
            <a href="/me/settings">Consent &amp; settings</a>
          </section>
          <section className="gx-panel">
            <div className="guest-section-heading">
              <h2>Offers by SMS</h2>
              <label className="consent-toggle">
                <span>{membership.marketingSms ? "On" : "Off"}</span>
                <input
                  type="checkbox"
                  checked={membership.marketingSms}
                  onChange={(event) => {
                    const update = api.member.setConsent(membership.id, event.target.checked);
                    setNotice(update.ok ? "Preference saved." : "Could not save your preference.");
                  }}
                  aria-label="Marketing SMS consent"
                />
              </label>
            </div>
            <p>Your loyalty card still works when this is off.</p>
            {membership.marketingSms && (
              <div className="optout-link-maker">
                <button
                  className="builder-secondary"
                  onClick={async () => {
                    const token = await api.member.createOptOutToken(membership.id);
                    if (token.ok) {
                      setOptoutUrl(`${window.location.origin}/u/${token.data}`);
                    } else {
                      setNotice(token.error.message);
                    }
                  }}
                >
                  Create SMS opt-out link
                </button>
                {optoutUrl && <a href={optoutUrl}>Open signed opt-out link</a>}
              </div>
            )}
            <h3>Consent history</h3>
            {consents.map((event) => (
              <p className="consent-history-row" key={event.id}>
                <strong>
                  {event.purpose.replace("_", " ")} · {event.action}
                </strong>
                <small>
                  {event.wordingText} · {event.source} ·{" "}
                  {new Intl.DateTimeFormat("en-ZA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.createdAt))}
                </small>
              </p>
            ))}
          </section>
          <section className="gx-panel">
            <h2>Recent visits</h2>
            {visits.length ? (
              visits.map((visit) => (
                <p className="visit-row" key={visit.id}>
                  <span>
                    {new Intl.DateTimeFormat("en-ZA", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(visit.createdAt))}
                  </span>
                  <strong>{visit.status === "valid" ? "Stamp collected" : "Stamp adjusted"}</strong>
                </p>
              ))
            ) : (
              <p>No visits yet.</p>
            )}
          </section>
          <small className="gx-note">
            Add to home screen tip: use your browser menu to add this card to your home screen.
          </small>
          {notice && (
            <p role="status" className="gx-note">
              {notice}
            </p>
          )}
        </GuestShell>
        {openReward && (
          <div
            className="reward-fullscreen"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-title"
          >
            <button className="reward-close" onClick={() => setRewardOpen(null)}>
              Close
            </button>
            <span className="eyebrow">Show this to the team</span>
            <h1 id="reward-title">{rewardEarned(openReward.description)}</h1>
            <strong className="reward-code">RWD-{customer.memberCode}</strong>
            <p>Demo redemption code · Ask a team member to confirm.</p>
          </div>
        )}
    </ThemeProvider>
  );
}

const cardSearchSchema = z.object({ customerId: z.string().optional() });

type LiveCard = NonNullable<Awaited<ReturnType<typeof getCardFn>>["card"]>;

/** Live-mode guest card (DATA_MODE=live): RLS-scoped rows from Postgres through
 *  the getCard server function. Demo rendering above is unchanged. */
function LiveGuestCard({ slug, card }: { slug: string; card: LiveCard }) {
  const available = card.rewards.filter((r) => r.status === "available");
  return (
    <main className="guest-page">
      <section className="guest-panel">
        <p className="eyebrow">Loyalty card</p>
        <h1>{card.restaurant.name}</h1>
        <p>
          {card.membership.stampsCurrent} of {card.restaurant.stampsRequired} stamps ·{" "}
          {card.restaurant.rewardDescription}
        </p>
        {available.length > 0 && (
          <p role="status">
            Reward ready: {available.map((r) => r.description).join(", ")}
          </p>
        )}
        <h2>Recent visits</h2>
        <ul>
          {card.stamps.map((stamp) => (
            <li key={stamp.id}>{new Date(stamp.createdAt).toLocaleDateString("en-ZA")}</li>
          ))}
        </ul>
        <a className="builder-primary" href={`/r/${slug}`}>
          View menu &amp; specials
        </a>
      </section>
    </main>
  );
}
