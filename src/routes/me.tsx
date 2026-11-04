import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn, getMyCardsFn, getViewerFn } from "@/server/live";
import type { LiveMyCards as LiveCardsData } from "@/server/live-dashboard";
import { GuestShell } from "@/components/patron/GuestShell";
import { PageHeader } from "@/components/patron/dash";
import {
  Button,
  EmptyState,
  Pill,
  StampCircles,
  VenueMark,
} from "@/components/patron/kit";
import { timeAgo } from "@/lib/time-ago";
import { venueTypeLabel } from "@/lib/venue-details";
import { signInAsDemoAccount } from "@/lib/demo-signin";
import { signOut } from "@/lib/sign-out";
import { ArrowRight, QrCode, Sparkles, Ticket } from "lucide-react";

const MyCardsPage = withChildren(MyCards);
export const Route = createFileRoute("/me")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") {
      const viewer = await getViewerFn();
      if (!viewer || !canOpenArea(viewer.role, "me")) {
        throw redirect({ to: "/login" });
      }
      if (viewer.needsPhone) throw redirect({ to: "/signup" });
      return;
    }
    if (!requireRole("guest")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
    if (typeof window !== "undefined" && !demoRepo.read().session.customerId) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getMyCardsFn() };
  },
  component: MyCardsPage,
});

function MyCards() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveMyCardsPage data={data.live} />;
  return <DemoMyCards />;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function DemoMyCards() {
  const state = useDemoState();
  const customerId = state.session.customerId;
  if (!customerId) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No guest session yet.</h1>
          <p>Sign in as a diner to see your cards.</p>
          <a className="builder-primary" href="/login">
            Log in
          </a>
        </section>
      </main>
    );
  }
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>We couldn&apos;t find that guest.</h1>
          <p>This demo guest may have been reset or replaced.</p>
          <button
            type="button"
            className="builder-primary"
            onClick={() => {
              demoRepo.reset();
              signInAsDemoAccount("diner");
            }}
          >
            Reset demo data
          </button>
        </section>
      </main>
    );
  }

  const result = api.member.cards(customerId);
  const memberships = result.ok ? result.data : [];
  const firstName = customer.name.split(" ")[0];

  return (
    <GuestShell title={customer.name}>
      <PageHeader
        eyebrow="My cards"
        title={`Hi ${firstName}`}
        intro="Every card you have joined, with the stamps, offers and spins ready for you today."
      />

      {memberships.length > 0 ? (
        <div className="mc-list">
          {memberships.map((membership) => {
            const restaurant = membership.restaurant;
            const tier = api.loyalty.tierState(state, membership);
            const offers = api.special.offersFor(membership.id);
            const offerCount = offers.ok
              ? offers.data.offers.filter(({ redeemed }) => !redeemed).length
              : 0;
            const spins = api.spin.state(membership.id);
            const spinCount = Math.max(spins.earned, spins.joinAvailable ? 1 : 0);
            const rewardReady = membership.rewards.some((reward) => !reward.redeemedAt);
            const lastVisit = membership.lastVisitAt
              ? `Last visit ${timeAgo(membership.lastVisitAt, state.now).toLowerCase()}`
              : "No visits yet";

            return (
              <Link
                key={membership.id}
                className="mc-card"
                to="/r/$slug/card"
                params={{ slug: restaurant.slug }}
                search={{}}
              >
                <div className="mc-card-head">
                  <VenueMark name={restaurant.name} theme={restaurant.theme} />
                  <div className="mc-card-title">
                    <strong>{restaurant.name}</strong>
                    <span>
                      {restaurant.suburb} · {venueTypeLabel(restaurant)}
                    </span>
                  </div>
                  <Pill className={`mc-tier tier-${tier.tier}`}>
                    {api.loyalty.tierLabel(tier.tier)}
                  </Pill>
                </div>

                <StampCircles
                  total={restaurant.stampsRequired}
                  filled={membership.stampsCurrent}
                  label={`${membership.stampsCurrent} of ${restaurant.stampsRequired} stamps`}
                  tick
                />

                <div className="mc-meta">
                  <Pill className="mc-meta-pill">
                    <Ticket size={14} aria-hidden="true" />
                    {countLabel(offerCount, "offer", "offers")}
                  </Pill>
                  <Pill className="mc-meta-pill">
                    <Sparkles size={14} aria-hidden="true" />
                    {countLabel(spinCount, "spin", "spins")}
                  </Pill>
                  {rewardReady && <Pill className="mc-reward-pill">Reward ready</Pill>}
                </div>

                <div className="mc-card-foot">
                  <span>{lastVisit}</span>
                  <span className="mc-card-open">
                    View card
                    <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No cards yet."
          hint="Open a place from Find and join its loyalty card. Your stamps will appear here."
          action={
            <Button variant="secondary" href="/find">
              Find a place
            </Button>
          }
        />
      )}

      <div className="mc-scan-row">
        <Button href="/find" className="mc-scan">
          <QrCode size={18} aria-hidden="true" />
          Scan a QR to join a place
        </Button>
      </div>
    </GuestShell>
  );
}

function liveVisitLabel(value: string | null) {
  if (!value) return "No visits yet";
  const date = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
  return `Last visit ${date}`;
}

function LiveMyCardsPage({ data }: { data: LiveCardsData | null }) {
  if (!data) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No card is linked to this login yet.</h1>
          <p>Finish your phone number, then join a restaurant to start a card.</p>
          <a className="builder-primary" href="/signup">
            Finish my details
          </a>
        </section>
      </main>
    );
  }

  const firstName = data.name.split(" ")[0];
  return (
    <GuestShell title={data.name}>
      <PageHeader
        eyebrow="My cards"
        title={`Hi ${firstName}`}
        intro="Every card you have joined, with the stamps and rewards ready for you today."
      />
      {data.cards.length ? (
        <div className="mc-list">
          {data.cards.map((card) => (
            <Link
              key={card.membershipId}
              className="mc-card"
              to="/r/$slug/card"
              params={{ slug: card.restaurantSlug }}
              search={{}}
            >
              <div className="mc-card-head">
                <VenueMark name={card.restaurantName} />
                <div className="mc-card-title">
                  <strong>{card.restaurantName}</strong>
                  <span>Loyalty card</span>
                </div>
                {card.rewardsReady > 0 && (
                  <Pill className="mc-reward-pill">
                    {countLabel(card.rewardsReady, "reward", "rewards")}
                  </Pill>
                )}
              </div>
              <StampCircles
                total={card.stampsRequired}
                filled={card.stampsCurrent}
                label={`${card.stampsCurrent} of ${card.stampsRequired} stamps`}
                tick
              />
              <div className="mc-card-foot">
                <span>{liveVisitLabel(card.lastVisitAt)}</span>
                <span className="mc-card-open">
                  View card
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No cards yet."
          hint="Open a place from Find and join its loyalty card."
          action={
            <Button variant="secondary" href="/find">
              Find a place
            </Button>
          }
        />
      )}
      <div className="mc-scan-row">
        <Button href="/find" className="mc-scan">
          <QrCode size={18} aria-hidden="true" />
          Scan a QR to join a place
        </Button>
      </div>
      <section className="gx-panel">
        <h2>Account</h2>
        <p className="gx-note">Log out of this account on this device.</p>
        <button
          type="button"
          className="builder-secondary"
          data-testid="guest-logout"
          onClick={() => void signOut("live")}
        >
          Log out
        </button>
      </section>
    </GuestShell>
  );
}
