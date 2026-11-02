import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import { demoRepo, updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn } from "@/server/live";
import { getViewerFn } from "@/server/auth-viewer";
import { OwnerSideNav, OwnerTabs } from "@/components/patron/OwnerNav";
import { PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { markOutletComponent } from "@/lib/nested";
import { PatronBrand } from "@/lib/patron-brand";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") {
      const viewer = await getViewerFn();
      if (!viewer || !canOpenArea(viewer.role, "app")) {
        throw redirect({ to: "/login" });
      }
      return;
    }
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
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
  const switchVenue = (id: string) => {
    updateDemo((current) => {
      const session = { ...current.session, restaurantId: id };
      delete session.tillPairedRestaurantId;
      delete session.staffExpiresAt;
      return { ...current, session };
    });
  };
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
        <header className="ox-top">
          {brand}
          {state.restaurants.length > 1 && (
            <select
              className="ox-venue-select"
              aria-label="Switch venue"
              value={restaurant.id}
              onChange={(event) => switchVenue(event.target.value)}
            >
              {state.restaurants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </header>
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
        <a href="/">Back to Patron</a>
      </main>
    );
  }
  const max = Math.max(1, ...result.data.weeklyVisits);
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Overview"
        title="Your week at a glance"
        actions={
          <>
            <a className="builder-primary" href="/stamp">
              Open the till
            </a>
            <a className="builder-secondary" href="/app/campaigns/new">
              New campaign
            </a>
          </>
        }
      />
      <StatGrid>
        {result.data.stats.map((stat) => (
          <StatCard
            key={stat.key}
            value={stat.display ?? stat.value}
            label={stat.label}
            hint={stat.tooltip}
            href={stat.href}
          />
        ))}
      </StatGrid>
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
        <h2>Next campaign</h2>
        {result.data.nextCampaign ? (
          <>
            <p>{result.data.nextCampaign.name}</p>
            <p className="demo-data-note">
              {result.data.nextCampaign.statusLabel} ·{" "}
              {result.data.nextCampaign.when
                ? `Sends ${result.data.nextCampaign.when}`
                : "Not scheduled yet"}
            </p>
            <div className="page-actions">
              <a className="builder-secondary" href={result.data.nextCampaign.href}>
                Open campaign
              </a>
            </div>
          </>
        ) : (
          <>
            <p>No campaign planned.</p>
            <div className="page-actions">
              <a className="builder-primary" href="/app/campaigns/new">
                New campaign
              </a>
            </div>
          </>
        )}
      </section>
      <section className="builder-panel">
        <h2>Last campaign</h2>
        {result.data.lastCampaign ? (
          <>
            <p>{result.data.lastCampaign.name}</p>
            <p className="demo-data-note">
              {result.data.lastCampaign.delivered} delivered · {result.data.lastCampaign.failed} failed
              {result.data.lastCampaign.sentLabel
                ? ` · sent ${result.data.lastCampaign.sentLabel}`
                : ""}
            </p>
            <div className="page-actions">
              <a className="builder-secondary" href={`/app/campaigns/${result.data.lastCampaign.id}`}>
                Open results
              </a>
            </div>
          </>
        ) : (
          <p>No campaign has been sent yet.</p>
        )}
      </section>
    </main>
  );
}
