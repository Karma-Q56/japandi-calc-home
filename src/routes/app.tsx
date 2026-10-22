import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { OwnerSideNav, OwnerTabs } from "@/components/patron/OwnerNav";
import { markOutletComponent } from "@/lib/nested";
import { PatronBrand } from "@/lib/patron-brand";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: markOutletComponent(OwnerShell),
});

function OwnerShell() {
  const state = useDemoState();
  const children = useChildMatches();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const brand = (
    <div className="ox-brand">
      <PatronBrand className="ox-brand-wordmark" />
      <span>
        <strong>{restaurant.name}</strong>
        <small>Owner view</small>
      </span>
    </div>
  );
  return (
    <div className="ox">
      <aside className="ox-side">
        {brand}
        <OwnerSideNav />
        <p className="ox-foot">
          Powered by {APP_NAME}.<br />
          Demo data. Nothing is sent to real guests.
        </p>
      </aside>
      <div className="ox-main">
        <header className="ox-top">{brand}</header>
        {children.length > 0 ? <Outlet /> : <Overview restaurantId={restaurant.id} />}
      </div>
      <OwnerTabs />
    </div>
  );
}

function Overview({ restaurantId }: { restaurantId: string }) {
  const state = useDemoState();
  const session = state.session;
  const result = api.dash.overview(restaurantId, {
    role: session.role,
    restaurantId: session.restaurantId,
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <h1>We couldn’t load the overview.</h1>
        <p>{result.error.message}</p>
        <a href="/demo">Back to demo hub</a>
      </main>
    );
  }
  const max = Math.max(1, ...result.data.weeklyVisits);
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Overview
      </p>
      <h1>Your week at a glance.</h1>
      <div className="page-actions">
        <a className="builder-primary" href="/stamp">
          Open the till
        </a>
        <a className="builder-secondary" href="/app/campaigns/new">
          New campaign
        </a>
      </div>
      <div className="stat-grid stat-grid--five">
        {result.data.stats.map((stat) => (
          <a className="stat-card" key={stat.key} title={stat.tooltip} href={stat.href}>
            <strong>{stat.display ?? stat.value}</strong>
            <span>{stat.label}</span>
            <small>{stat.tooltip}</small>
            <em>{stat.action} →</em>
          </a>
        ))}
      </div>
      <section className="builder-panel">
        <h2>Visits · last 8 weeks</h2>
        <div
          className="week-chart"
          role="img"
          aria-label={`Weekly visits: ${result.data.weeklyVisits.join(", ")}`}
        >
          {result.data.weeklyVisits.map((visits, index) => (
            <span key={index} title={`${visits} visits`}>
              <i style={{ height: `${Math.round((visits / max) * 100)}%` }} />
              <small>{visits}</small>
            </span>
          ))}
        </div>
      </section>
      <section className="builder-panel dashboard-next-campaign">
        <h2>Next campaign</h2>
        {result.data.lastCampaign ? (
          <p className="dashboard-next-campaign-row">
            <span className="dashboard-campaign-name">{result.data.lastCampaign.name}</span>
            <span>{result.data.lastCampaign.delivered} delivered, {result.data.lastCampaign.failed} failed.</span>
          </p>
        ) : (
          <p>No upcoming campaigns. Send your first offer from Campaigns.</p>
        )}
      </section>
    </main>
  );
}
