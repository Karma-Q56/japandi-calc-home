import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: OwnerShell,
});

const NAV = [
  { to: "/app", label: "Overview", end: true },
  { to: "/app/customers", label: "Customers", end: false },
  { to: "/app/loyalty", label: "Loyalty", end: false },
  { to: "/app/campaigns", label: "Campaigns", end: false },
  { to: "/app/credit", label: "Credit", end: false },
  { to: "/app/team", label: "Team", end: false },
  { to: "/app/menu", label: "Menu", end: false },
  { to: "/app/qr", label: "QR", end: false },
  { to: "/app/audit", label: "Audit", end: false },
  { to: "/app/settings", label: "Settings", end: false },
];

function OwnerShell() {
  const state = useDemoState();
  const children = useChildMatches();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  return (
    <div className="owner-shell">
      <aside className="owner-side">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          {restaurant.name}
        </p>
        <nav aria-label="Owner sections">
          {NAV.map((item) => (
            <a key={item.to} href={item.to}>
              {item.label}
            </a>
          ))}
        </nav>
        <p className="demo-data-note">Powered by {APP_NAME} · Demo data</p>
      </aside>
      <div className="owner-main">
        <nav className="owner-bottom" aria-label="Owner sections">
          {NAV.map((item) => (
            <a key={item.to} href={item.to}>
              {item.label}
            </a>
          ))}
        </nav>
        {children.length > 0 ? <Outlet /> : <Overview restaurantId={restaurant.id} />}
      </div>
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
      <div className="stat-grid">
        {result.data.stats.map((stat) => (
          <article className="stat-card" key={stat.key} title={stat.tooltip}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
            <small>{stat.tooltip}</small>
          </article>
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
      <section className="builder-panel">
        <h2>Last campaign</h2>
        {result.data.lastCampaign ? (
          <p>
            {result.data.lastCampaign.name} · {result.data.lastCampaign.delivered} delivered,{" "}
            {result.data.lastCampaign.failed} failed.
          </p>
        ) : (
          <p>No campaigns yet — that arrives in M7.</p>
        )}
      </section>
    </main>
  );
}
