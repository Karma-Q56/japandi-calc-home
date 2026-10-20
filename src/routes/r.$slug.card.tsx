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
import { MemberQr } from "@/components/patron/MemberQr";
import { SpinWheel } from "@/components/patron/SpinWheel";
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
  const { restaurant, customer, membership, rewards, offers, visits, stampsGained } = result.data;
  const tier = api.loyalty.tierState(state, membership);
  const challenges = api.loyalty.challenges(state, membership);
  const spins = api.spin.state(membership.id);
  const specialResult = api.special.offersFor(membership.id);
  const specialOffers = specialResult.ok ? specialResult.data.offers : [];
  const openReward = rewards.find((item) => item.id === rewardOpen);
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
        <div className="card-badges">
          <span className={`tier-pill tier-${tier.tier}`}>
            {api.loyalty.tierLabel(tier.tier)}
          </span>
          {tier.nextTier && (
            <span className="gx-note">
              {tier.visitsToNext} more visit{tier.visitsToNext === 1 ? "" : "s"} to{" "}
              {api.loyalty.tierLabel(tier.nextTier)}
            </span>
          )}
          {spins.earned > 0 && (
            <span className="spin-pill">
              {spins.earned} spin{spins.earned === 1 ? "" : "s"} ready
            </span>
          )}
        </div>
        {stampsGained > 0 && (
          <p className="gx-note" role="status">
            {stampsGained} new {stampsGained === 1 ? "stamp" : "stamps"} since your last visit.
          </p>
        )}

        <SpinWheel membershipId={membership.id} />

        {challenges.length > 0 && (
          <section className="gx-panel">
            <h2>Visit challenges</h2>
            {challenges.map(({ challenge, visits: progress, done, claimed }) => (
              <article className="challenge-row" key={challenge.id}>
                <div>
                  <strong>{challenge.title}</strong>
                  <small>
                    {progress} of {challenge.visits} visits in the last {challenge.windowDays} days
                  </small>
                </div>
                <span className={done ? "challenge-state is-done" : "challenge-state"}>
                  {claimed ? "Bonus added" : done ? "Earned" : `${challenge.bonusStamps} bonus stamp`}
                </span>
                <div className="challenge-track" aria-hidden>
                  <span
                    style={{
                      width: `${Math.min(100, Math.round((progress / challenge.visits) * 100))}%`,
                    }}
                  />
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="gx-panel gx-code">
          <h2>Show this at the till</h2>
          <MemberQr memberCode={customer.memberCode} />
          <strong>{customer.memberCode}</strong>
          <small className="gx-note">
            Staff scan the code or type your member number. The QR refreshes itself.
          </small>
        </section>

        <section className="gx-panel">
          <div className="guest-section-heading">
            <h2>Rewards waiting</h2>
            <span>{waiting.length}</span>
          </div>
          {waiting.length ? (
            waiting.map((reward) => (
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
          {specialOffers.length === 0 && offers.length === 0 && (
            <p className="demo-data-note">No offers right now. We&apos;ll add them here.</p>
          )}
          {specialOffers.map(({ special, code, redeemed }) => (
            <article className="guest-list-item" key={special.id}>
              <span>
                <strong>{special.title}</strong>
                <small>{special.body}</small>
                <small>
                  {special.kind === "targeted"
                    ? "Just for you"
                    : special.kind === "members"
                      ? "Members only"
                      : "Everyone"}{" "}
                  · Code {code?.code ?? special.code ?? "—"}
                </small>
              </span>
              <button
                onClick={() =>
                  setNotice(
                    redeemed
                      ? "That offer has already been redeemed."
                      : `Show code ${code?.code ?? special.code} to the team.`,
                  )
                }
              >
                {redeemed ? "Used" : "Show to staff"}
              </button>
            </article>
          ))}
          {offers.map((offer) => (
            <article className="guest-list-item" key={offer.id}>
              <span>
                <strong>{offer.name}</strong>
                <small>{offer.body}</small>
                <small>
                  Code {offer.code} · Expires{" "}
                  {new Intl.DateTimeFormat("en-ZA", {
                    dateStyle: "medium",
                  }).format(
                    new Date(new Date(offer.sentAt ?? offer.createdAt).getTime() + 30 * 86400000),
                  )}
                </small>
              </span>
              <button onClick={() => setNotice(`Show code ${offer.code} to the team.`)}>
                Show to staff
              </button>
            </article>
          ))}
        </section>

        <section className="gx-panel guest-shortcuts">
          <a href={`/r/${slug}`}>Menu &amp; specials</a>
          <a href="/me/restaurants">All restaurants</a>
          <a href="/me/settings">Notifications &amp; details</a>
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
                <strong>
                  {visit.reason === "welcome"
                    ? "Welcome stamp"
                    : visit.reason === "challenge"
                      ? "Challenge bonus"
                      : visit.reason === "birthday"
                        ? "Birthday bonus"
                        : visit.reason === "mystery"
                          ? "Mystery bonus"
                          : visit.status === "valid"
                            ? "Stamp collected"
                            : "Stamp adjusted"}
                </strong>
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
        <div className="reward-fullscreen" role="dialog" aria-modal="true" aria-labelledby="reward-title">
          <button className="reward-close" onClick={() => setRewardOpen(null)}>
            Close
          </button>
          <span className="eyebrow">Show this to the team</span>
          <h1 id="reward-title">{rewardEarned(openReward.description)}</h1>
          <strong className="reward-code">RWD-{customer.memberCode}</strong>
          <p>Show your card at the till and the team will confirm it.</p>
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
