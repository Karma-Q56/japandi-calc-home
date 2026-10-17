import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { ThemeProvider } from "@/theme";
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
    <main className="guest-page">
      <header className="guest-header">
        <a href="/demo">{customer.name}</a>
        <a href="/me/settings">Settings</a>
      </header>
      <section className="guest-card-content">
        <p className="eyebrow">Your regular places</p>
        <h1>My cards.</h1>
        {memberships.length ? (
          <div className="my-cards-list">
            {memberships.map((item) => {
              const reward = item.rewards.some((value) => !value.redeemedAt);
              const days = item.lastVisitAt
                ? Math.max(
                    0,
                    Math.floor((clock.now() - new Date(item.lastVisitAt).getTime()) / 86400000),
                  )
                : null;
              return (
                <ThemeProvider key={item.id} theme={item.restaurant.theme}>
                  <a className="my-card-tile" href={`/r/${item.restaurant.slug}/card`}>
                    <div className="my-card-top">
                      <span>{item.restaurant.name}</span>
                      {reward && <b>Reward ready</b>}
                    </div>
                    <p>
                      {item.stampsCurrent} of {item.restaurant.stampsRequired} stamps
                    </p>
                    <div className="my-card-progress">
                      <i
                        style={{
                          width: `${Math.min(100, (item.stampsCurrent / item.restaurant.stampsRequired) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {days === null
                        ? "No visits yet"
                        : days === 0
                          ? "Last visit today"
                          : `Last visit ${days} ${days === 1 ? "day" : "days"} ago`}
                    </small>
                  </a>
                </ThemeProvider>
              );
            })}
          </div>
        ) : (
          <section className="guest-panel">
            <h2>No cards yet.</h2>
            <p>Join a restaurant by scanning its QR code or opening its page.</p>
            <a className="builder-primary" href="/demo">
              Explore the demo
            </a>
          </section>
        )}
      </section>
    </main>
  );
}
