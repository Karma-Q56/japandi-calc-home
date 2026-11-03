import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn, getMyCardsFn, getViewerFn } from "@/server/live";
import type { LiveMyCards as LiveCardsData } from "@/server/live-dashboard";
import { GuestShell } from "@/components/patron/GuestShell";
import { LoyaltyCard } from "@/components/patron/LoyaltyCard";
import { PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { clock } from "@/lib/clock";
import { signInAsDemoAccount } from "@/lib/demo-signin";

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

function lastVisitLabel(iso: string | null) {
  if (!iso) return "No visits yet";
  const date = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
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
  const cards = data.cards;
  const firstName = data.name.split(" ")[0];
  const rewardsReady = cards.reduce((sum, card) => sum + card.rewardsReady, 0);
  const stampsHeld = cards.reduce((sum, card) => sum + card.stampsCurrent, 0);
  return (
    <GuestShell title={data.name}>
      <PageHeader
        eyebrow="My cards"
        title={`Hi ${firstName}`}
        intro="Every card you have joined, with the stamps and rewards ready for you today."
      />
      {cards.length > 0 && (
        <StatGrid dense>
          <StatCard value={cards.length} label={cards.length === 1 ? "card joined" : "cards joined"} />
          <StatCard
            value={rewardsReady}
            label={rewardsReady === 1 ? "reward ready" : "rewards ready"}
            tone={rewardsReady > 0 ? "good" : undefined}
          />
          <StatCard
            value={stampsHeld}
            label={stampsHeld === 1 ? "stamp collected" : "stamps collected"}
          />
        </StatGrid>
      )}
      {cards.length ? (
        <div className="gx-cards">
          {cards.map((card) => (
            <a
              key={card.membershipId}
              className="restaurant-card"
              href={`/r/${card.restaurantSlug}/card`}
            >
              <span className="restaurant-thumb" aria-hidden>
                {card.restaurantName.slice(0, 1)}
              </span>
              <span className="restaurant-card-body">
                <strong>{card.restaurantName}</strong>
                <small>
                  {card.stampsCurrent} of {card.stampsRequired} stamps for {card.rewardDescription}
                </small>
                {card.rewardsReady > 0 && (
                  <span className="gx-badge">
                    {card.rewardsReady === 1 ? "1 reward ready" : `${card.rewardsReady} rewards ready`}
                  </span>
                )}
                <small>{lastVisitLabel(card.lastVisitAt)}</small>
              </span>
              <b aria-hidden>›</b>
            </a>
          ))}
        </div>
      ) : (
        <section className="gx-panel">
          <h2>No cards yet.</h2>
          <p>Join a restaurant by scanning its QR code or opening its page.</p>
          <a className="builder-primary" href="/for-diners#find-a-restaurant">
            Find a restaurant
          </a>
        </section>
      )}
    </GuestShell>
  );
}

function DemoMyCards() {
  const state = useDemoState();
  const [resetNote, setResetNote] = useState("");
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
          <h1>We couldn’t find that guest.</h1>
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
  const rewardsReady = memberships.filter((item) =>
    item.rewards.some((reward) => !reward.redeemedAt),
  ).length;
  const stampsHeld = memberships.reduce((sum, item) => sum + item.stampsCurrent, 0);
  return (
    <GuestShell title={customer.name}>
      <PageHeader
        eyebrow="My cards"
        title={`Hi ${firstName}`}
        intro="Every card you have joined, with the stamps and rewards ready for you today."
      />
      {memberships.length > 0 && (
        <StatGrid dense>
          <StatCard
            value={memberships.length}
            label={memberships.length === 1 ? "card joined" : "cards joined"}
          />
          <StatCard
            value={rewardsReady}
            label={rewardsReady === 1 ? "reward ready" : "rewards ready"}
            tone={rewardsReady > 0 ? "good" : undefined}
          />
          <StatCard
            value={stampsHeld}
            label={stampsHeld === 1 ? "stamp collected" : "stamps collected"}
          />
        </StatGrid>
      )}
      {memberships.length ? (
        <div className="gx-cards">
          {memberships.map((item) => {
            const reward = item.rewards.some((value) => !value.redeemedAt);
            const days = item.lastVisitAt
              ? Math.max(
                  0,
                  Math.floor((clock.now() - new Date(item.lastVisitAt).getTime()) / 86400000),
                )
              : null;
            return (
              <Link key={item.id} to="/r/$slug/card" params={{ slug: item.restaurant.slug }} search={{}}>
                <LoyaltyCard
                  compact
                  theme={item.restaurant.theme}
                  name={item.restaurant.name}
                  filled={item.stampsCurrent}
                  total={item.restaurant.stampsRequired}
                />
                {reward && <span className="gx-badge">Reward ready</span>}
                <p className="gx-note" style={{ textAlign: "left", marginTop: 8 }}>
                  {days === null
                    ? "No visits yet"
                    : days === 0
                      ? "Last visit today"
                      : `Last visit ${days} ${days === 1 ? "day" : "days"} ago`}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="gx-panel">
          <h2>No cards yet.</h2>
          <p>Join a restaurant by scanning its QR code or opening its page.</p>
          <a className="builder-primary" href="/for-diners#find-a-restaurant">
            Find a restaurant
          </a>
        </section>
      )}
      <section className="gx-panel">
        <div className="guest-section-heading">
          <h2>Demo data</h2>
        </div>
        <p className="gx-note">
          If a card looks out of date or will not open, reset the demo data stored in this browser.
          This clears local demo changes and signs you back in as a demo diner.
        </p>
        <button
          type="button"
          className="builder-secondary"
          onClick={() => {
            demoRepo.reset();
            signInAsDemoAccount("diner");
            setResetNote("Demo data was reset, and a demo diner is signed in.");
          }}
        >
          Reset demo data
        </button>
        {resetNote && (
          <p className="gx-note" role="status">
            {resetNote}
          </p>
        )}
      </section>
    </GuestShell>
  );
}
