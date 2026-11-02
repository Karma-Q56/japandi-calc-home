import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import type { Overview } from "@/domain/dash";
import { demoRepo, updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn, getOwnerOverviewFn, getViewerFn } from "@/server/live";
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
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getOwnerOverviewFn() };
  },
  component: markOutletComponent(OwnerShell),
});

function OwnerShell() {
  const data = Route.useLoaderData();
  const isLive = data.mode === "live";
  const live = isLive ? data.live : null;
  const state = useDemoState();
  const children = useChildMatches();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const restaurantName = live?.restaurantName ?? restaurant.name;
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
        <strong>{restaurantName}</strong>
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
          {isLive ? "Live data from this restaurant." : "Demo data. Nothing is sent to real guests."}
        </p>
      </aside>
      <div className="ox-main">
        <header className="ox-top">
          {brand}
          {!isLive && state.restaurants.length > 1 && (
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
        {children.length > 0 ? (
          isLive ? (
            <LiveToolsNotice />
          ) : (
            <Outlet />
          )
        ) : isLive && !live ? (
          <LiveUnavailable />
        ) : (
          <Overview restaurantId={restaurant.id} live={live?.overview ?? null} />
        )}
      </div>
      <OwnerTabs />
    </div>
  );
}

function LiveToolsNotice() {
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Live mode"
        title="The overview is live. The other owner tools come next."
        intro="This phase connects your real stamps, guests, rewards, credit and campaigns to the overview. Campaign builders and settings still open in demo only, so they are switched off while live."
      />
      <section className="builder-panel">
        <h2>What works now</h2>
        <p>The overview shows counts from your restaurant in Postgres.</p>
        <p className="demo-data-note">Guests and campaigns are counted from real rows.</p>
        <div className="page-actions">
          <a className="builder-primary" href="/app">
            Back to the live overview
          </a>
        </div>
      </section>
    </main>
  );
}

function LiveUnavailable() {
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Live mode"
        title="This login is not linked to a restaurant."
        intro="Ask Patron to link your owner account to a restaurant, then sign in again."
      />
      <section className="builder-panel">
        <p>No restaurant was found for this account.</p>
        <div className="page-actions">
          <a className="builder-secondary" href="/login">
            Back to login
          </a>
        </div>
      </section>
    </main>
  );
}

function Overview({ restaurantId, live }: { restaurantId: string; live: Overview | null }) {
  const state = useDemoState();
  const session = state.session;
  if (live) return <OverviewBody data={live} />;
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
  return <OverviewBody data={result.data} />;
}

function OverviewBody({ data }: { data: Overview }) {
  const max = Math.max(1, ...data.weeklyVisits);
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
        {data.stats.map((stat) => (
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
          aria-label={`Weekly visits: ${data.weeklyVisits.join(", ")}`}
        >
          {data.weeklyVisits.map((visits, index) => (
            <span key={index} title={`${visits} visits`}>
              <i style={{ height: `${Math.round((visits / max) * 100)}%` }} />
              <small>{visits}</small>
            </span>
          ))}
        </div>
      </section>
      <section className="builder-panel">
        <h2>Next campaign</h2>
        {data.nextCampaign ? (
          <>
            <p>{data.nextCampaign.name}</p>
            <p className="demo-data-note">
              {data.nextCampaign.statusLabel} ·{" "}
              {data.nextCampaign.when ? `Sends ${data.nextCampaign.when}` : "Not scheduled yet"}
            </p>
            <div className="page-actions">
              <a className="builder-secondary" href={data.nextCampaign.href}>
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
        {data.lastCampaign ? (
          <>
            <p>{data.lastCampaign.name}</p>
            <p className="demo-data-note">
              {data.lastCampaign.delivered} delivered · {data.lastCampaign.failed} failed
              {data.lastCampaign.sentLabel ? ` · sent ${data.lastCampaign.sentLabel}` : ""}
            </p>
            <div className="page-actions">
              <a className="builder-secondary" href={`/app/campaigns/${data.lastCampaign.id}`}>
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
