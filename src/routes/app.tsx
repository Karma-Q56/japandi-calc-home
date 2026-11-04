import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches, useLocation } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import type { Overview } from "@/domain/dash";
import { demoRepo, updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn, getOwnerOverviewFn, getViewerFn } from "@/server/live";
import { OwnerSideNav, OwnerMobileNav } from "@/components/patron/OwnerNav";
import { PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { BackLink } from "@/components/patron/BackLink";
import { markOutletComponent } from "@/lib/nested";
import { signOut } from "@/lib/sign-out";
import { Avatar, VenueMark } from "@/components/patron/kit";
import { ChevronDown, LogOut } from "lucide-react";

const OWNER_TABS = new Set(["/app", "/app/insights", "/app/reports", "/app/customers"]);

/** Non-tab owner screens get one parent destination from the route they are on. */
function ownerBackFor(pathname: string) {
  const clean = pathname.replace(/\/$/, "") || "/app";
  if (!clean.startsWith("/app/") || OWNER_TABS.has(clean)) return null;
  const parent = clean.slice(0, clean.lastIndexOf("/"));
  return { to: OWNER_TABS.has(parent) ? parent : "/app", label: "Back" };
}

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
  const location = useLocation();
  const parts = location.pathname.replace(/\/$/, "").split("/");
  const liveChild =
    parts[1] === "app" &&
    (((parts[2] === "loyalty" || parts[2] === "menu") && parts.length === 3) ||
      ((parts[2] === "customers" || parts[2] === "campaigns") &&
        (parts.length === 3 || (parts.length === 4 && parts[3] !== "new"))));
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
  const showVenueSwitcher = !isLive && state.restaurants.length > 1;
  const back = ownerBackFor(location.pathname);
  const signedInName = state.session.staffId
    ? state.staff.find((item) => item.id === state.session.staffId)?.displayName
    : undefined;
  const viewerName = signedInName ?? (state.session.role === "manager" ? "Manager" : "Owner");
  const brand = (
    <div className="ox-brand">
      <VenueMark name={restaurantName} theme={restaurant.theme} size="sm" />
      <span className="ox-brand-copy">
        <strong>{restaurantName}</strong>
        <span className="ox-owner-tag">OWNER</span>
      </span>
    </div>
  );
  const venuePicker = showVenueSwitcher ? (
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
  ) : null;
  return (
    <div className="ox">
      <aside className="ox-side">
        {brand}
        {showVenueSwitcher && (
          <label className="ox-venue-picker">
            Venue
            {venuePicker}
          </label>
        )}
        <OwnerSideNav />
        <p className="ox-foot">
          Powered by {APP_NAME}.<br />
          {isLive
            ? "Live data from this restaurant."
            : "Demo data. Nothing is sent to real guests."}
        </p>
      </aside>
      <div className="ox-main">
        <OwnerAccount displayName={viewerName} venueName={restaurantName} mode={data.mode} />
        {back && (
          <div className="ox-back">
            <BackLink to={back.to} label={back.label} />
          </div>
        )}
        <header className="ox-top">
          {brand}
        </header>
        <OwnerMobileNav venueSwitcher={venuePicker} />
        {children.length > 0 ? (
          isLive ? (
            liveChild ? (
              <Outlet />
            ) : (
              <LiveToolsNotice />
            )
          ) : (
            <Outlet />
          )
        ) : isLive && !live ? (
          <LiveUnavailable />
        ) : (
          <Overview restaurantId={restaurant.id} live={live?.overview ?? null} />
        )}
      </div>
    </div>
  );
}

function OwnerAccount({
  displayName,
  venueName,
  mode,
}: {
  displayName: string;
  venueName: string;
  mode: "demo" | "live";
}) {
  return (
    <div className="ox-accountbar">
      <details className="ox-account">
        <summary data-testid="owner-account">
          <Avatar name={displayName} />
          <span className="ox-account-name">{displayName}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="ox-account-menu">
          <p>
            <strong>{displayName}</strong>
            <small>{venueName}</small>
          </p>
          <button
            type="button"
            className="builder-secondary"
            data-testid="owner-logout"
            onClick={() => void signOut(mode)}
          >
            <LogOut size={15} aria-hidden="true" /> Log out
          </button>
        </div>
      </details>
    </div>
  );
}

function LiveToolsNotice() {
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Live mode"
        title="This owner tool is not live yet."
        intro="Your overview, guest list, guest profiles, campaign list and results, loyalty card rules and menu are connected to your restaurant. This screen still uses demo data, so it is switched off while live."
      />
      <section className="builder-panel">
        <h2>What is live today</h2>
        <p>
          Use the owner menu for real stamps, guests, rewards, campaigns, card rules and menu items.
        </p>
        <p className="demo-data-note">The remaining builders follow in a later phase.</p>
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
