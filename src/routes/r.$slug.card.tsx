import {
  createFileRoute,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
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
import { PageHeader } from "@/components/patron/dash";
import { MemberQr } from "@/components/patron/MemberQr";
import { SpinWheel } from "@/components/patron/SpinWheel";
import { ChallengeRow } from "@/components/patron/ChallengeRow";
import { rewardEarned, rewardProgress } from "@/lib/reward-copy";
import { signInAsDemoAccount } from "@/lib/demo-signin";

export const Route = createFileRoute("/r/$slug/card")({
  validateSearch: (search) => cardSearchSchema.parse(search),
  loader: async ({ params }) => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    const { card } = await getCardFn({ data: { slug: params.slug } });
    return { mode, live: card };
  },
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("guest")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
    if (typeof window !== "undefined" && !demoRepo.read().session.customerId) {
      throw redirect({ to: "/login" });
    }
  },
  component: GuestCard,
  errorComponent: CardError,
});

/**
 * A card that cannot render must say so. A blank page tells a guest nothing, and the
 * most common cause here is a stale demo snapshot in this browser.
 */
function CardError({ error }: ErrorComponentProps) {
  console.error(error);
  const detail = error instanceof Error ? error.message : "";
  return (
    <main className="guest-page">
      <section className="guest-panel card-error" role="alert">
        <p className="eyebrow">This card did not open</p>
        <h1>We could not load this card.</h1>
        <p>
          Something in the saved card data did not match what this page expects. Your stamps are
          safe, this is a display problem, not a lost visit.
        </p>
        <div className="card-error-actions">
          <button
            type="button"
            onClick={() => {
              demoRepo.reset();
              signInAsDemoAccount("diner");
              window.location.assign("/me");
            }}
          >
            Reset demo data
          </button>
          <a className="builder-primary" href="/me">
            Back to my cards
          </a>
        </div>
        {detail && (
          <small className="gx-note">
            Details for the team: <code>{detail}</code>
          </small>
        )}
      </section>
    </main>
  );
}

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
          <p>Log in as a diner to see this card.</p>
          <a className="builder-primary" href="/login">
            Log in
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
            <a href="/me">Back to my cards</a>
          </p>
        </section>
      </main>
    );
  }
  const { restaurant, customer, membership, rewards, offers, visits, stampsGained } = result.data;
  const tier = api.loyalty.tierState(state, membership);
  const challenges = api.loyalty.challenges(state, membership);
  const tools = api.loyalty.toolsView(state, membership);
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
          {spins.joinAvailable && <span className="spin-pill">Welcome spin ready</span>}
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

        {tools.doubleDayLine && (
          <section className="gx-panel">
            <h2>Double stamps</h2>
            <p className="gx-note">{tools.doubleDayLine}</p>
          </section>
        )}

        {tools.streak && (
          <section className="gx-panel">
            <h2>Visit streak</h2>
            <p>
              <strong>
                {tools.streak.run} {tools.streak.run === 1 ? "week" : "weeks"} in a row
              </strong>
            </p>
            {tools.streak.visitsThisWeek < tools.streak.weeklyVisits ? (
              <p className="gx-note">
                {tools.streak.weeklyVisits - tools.streak.visitsThisWeek} more
                {" "}{tools.streak.weeklyVisits - tools.streak.visitsThisWeek === 1 ? "visit" : "visits"} this week keeps the run alive.
              </p>
            ) : (
              <p className="gx-note">This week already counts. Next week, same again.</p>
            )}
            <ChallengeRow
              title={`${tools.streak.bonusStamps} bonus ${tools.streak.bonusStamps === 1 ? "stamp" : "stamps"} at ${tools.streak.weeks} ${tools.streak.weeks === 1 ? "week" : "weeks"}`}
              visits={tools.streak.run}
              needed={tools.streak.weeks}
              windowDays={7}
              bonusStamps={tools.streak.bonusStamps}
              done={tools.streak.run >= tools.streak.weeks}
              claimed={false}
            />
          </section>
        )}

        {challenges.length > 0 && (
          <section className="gx-panel">
            <h2>Visit challenges</h2>
            {challenges.map(({ challenge, visits: progress, done, claimed }) => (
              <ChallengeRow
                key={challenge.id}
                title={challenge.title}
                visits={progress}
                needed={challenge.visits}
                windowDays={challenge.windowDays}
                bonusStamps={challenge.bonusStamps}
                done={done}
                claimed={claimed}
              />
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

        {restaurant.referral?.enabled && <BringAFriend slug={slug} membershipId={membership.id} />}

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
                  · Code {code?.code ?? special.code ?? "not set"}
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
          <a className="builder-secondary" href={`/r/${slug}`}>
            Menu &amp; specials
          </a>
          <a className="builder-secondary" href="/me/restaurants">
            All restaurants
          </a>
          <a className="builder-secondary" href="/me/settings">
            Notifications &amp; details
          </a>
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

/** The guest side of bring a friend: their own link, or code, to share. */
function BringAFriend({ slug, membershipId }: { slug: string; membershipId: string }) {
  const [notice, setNotice] = useState("");
  // The share code is created on the first view, so it must not write the store
  // while React is still rendering. Doing it in an effect keeps the console
  // free of "cannot update a component while rendering" warnings.
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const result = api.referral.myCode(membershipId);
    if (result.ok) setCode(result.data.code);
  }, [membershipId]);
  if (!code) return null;
  const link = `${window.location.origin}/r/${slug}/join?ref=${code}&src=friend_referral`;
  return (
    <section className="gx-panel">
      <h2>Bring a friend</h2>
      <p className="gx-note">
        Share your link. When your friend gets their first stamped visit here, you both get a
        little something from the venue.
      </p>
      <p className="gx-note">
        Your friend code: <strong>{code}</strong>
      </p>
      <div className="page-actions">
        <button
          className="builder-secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(
              () => setNotice("Link copied. Send it to your friend."),
              () => setNotice(link),
            );
          }}
        >
          Copy my link
        </button>
        <a className="builder-secondary" href={link}>
          Open my join link
        </a>
      </div>
      {notice && (
        <p className="gx-note" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

type LiveCard = NonNullable<Awaited<ReturnType<typeof getCardFn>>["card"]>;

/** Live-mode guest card (DATA_MODE=live): RLS-scoped rows from Postgres through
 *  the getCard server function. Demo rendering above is unchanged. */
function LiveGuestCard({ slug, card }: { slug: string; card: LiveCard }) {
  const available = card.rewards.filter((r) => r.status === "available");
  return (
    <GuestShell back={{ to: "/me", label: "My cards" }}>
      <PageHeader
        eyebrow="Loyalty card"
        title={card.restaurant.name}
        intro={`${card.membership.stampsCurrent} of ${card.restaurant.stampsRequired} stamps · ${card.restaurant.rewardDescription}`}
      />
      <section className="gx-panel">
        {available.length > 0 && (
          <p role="status">
            <strong>Reward ready:</strong> {available.map((r) => r.description).join(", ")}
          </p>
        )}
        <div className="guest-section-heading">
          <h2>Recent visits</h2>
          <span>{card.stamps.length}</span>
        </div>
        {card.stamps.length === 0 ? (
          <p className="demo-data-note">No visits yet.</p>
        ) : (
          card.stamps.map((stamp) => (
            <p className="visit-row" key={stamp.id}>
              <span>
                {new Intl.DateTimeFormat("en-ZA", {
                  dateStyle: "medium",
                  timeZone: "Africa/Johannesburg",
                }).format(new Date(stamp.createdAt))}
              </span>
              <strong>Stamp collected</strong>
            </p>
          ))
        )}
        <a className="builder-primary" href={`/r/${slug}`}>
          View menu &amp; specials
        </a>
      </section>
    </GuestShell>
  );
}
