import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { GuestShell } from "@/components/patron/GuestShell";
import { LoyaltyCard } from "@/components/patron/LoyaltyCard";
import { clock } from "@/lib/clock";

const MyCardsPage = withChildren(MyCards);
export const Route = createFileRoute("/me")({
  beforeLoad: () => {
    if (!requireRole("guest")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
    if (typeof window !== "undefined" && !demoRepo.read().session.customerId) {
      throw redirect({ to: "/demo" });
    }
  },
  component: MyCardsPage,
});

function MyCards() {
  const state = useDemoState();
  const customerId = state.session.customerId;
  if (!customerId) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No guest session yet.</h1>
          <p>Pick a guest tunnel from the demo hub first.</p>
          <a className="builder-primary" href="/demo">
            Back to demo hub
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
          <p>This demo guest may have been reset.</p>
          <a className="builder-primary" href="/demo">
            Back to demo hub
          </a>
        </section>
      </main>
    );
  }
  const result = api.member.cards(customerId);
  const memberships = result.ok ? result.data : [];
  return (
    <GuestShell title={customer.name}>
      <p className="gx-hello">Hi {customer.name.split(" ")[0]} 👋</p>
      <h1>My cards.</h1>
      {memberships.length > 0 && (
        <p className="gx-summary">
          <span>
            <b>{memberships.length}</b> {memberships.length === 1 ? "card" : "cards"}
          </span>
          <span>
            <b>{memberships.filter((m) => m.rewards.some((r) => !r.redeemedAt)).length}</b> reward
            ready
          </span>
        </p>
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
          <a className="builder-primary" href="/demo">
            Explore the demo
          </a>
        </section>
      )}
    </GuestShell>
  );
}
