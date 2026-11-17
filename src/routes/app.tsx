import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet, useChildMatches, useLocation } from "@tanstack/react-router";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import type { Overview } from "@/domain/dash";
import { demoRepo, updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import {
  createRestaurantFn,
  checkSlugFn,
  getDataModeFn,
  getMyRestaurantFn,
  getOwnerOverviewFn,
  getViewerFn,
} from "@/server/live";
import { getBillingBannerFn } from "@/server/live-billing-fns";
import { BillingBanner } from "@/components/patron/BillingBanner";
import {
  OwnerSideNav,
  OwnerMobileNav,
  OwnerTabs,
  OwnerSectionTabs,
} from "@/components/patron/OwnerNav";
import { FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { DemoHome } from "@/components/patron/DemoHome";
import { LivePublishCard } from "@/components/patron/LivePublishCard";
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
      // A new signed-in guest with no restaurant sets one up here.
      const needsSetup = viewer?.role === "guest" && viewer.restaurantId === null;
      if (!viewer || (!needsSetup && !canOpenArea(viewer.role, "app"))) {
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
    if (mode !== "live") return { mode, live: null, needsSetup: false, published: true, banner: null };
    const viewer = await getViewerFn();
    const needsSetup = viewer?.role === "guest" && viewer.restaurantId === null;
    if (needsSetup) return { mode, live: null, needsSetup, published: false, banner: null };
    const [live, mine, banner] = await Promise.all([
      getOwnerOverviewFn(),
      getMyRestaurantFn(),
      getBillingBannerFn(),
    ]);
    return { mode, live, needsSetup, published: mine?.published ?? false, banner };
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
  const setupNeeded = isLive && data.needsSetup;
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
        <header className="ox-top">{brand}</header>
        <OwnerMobileNav venueSwitcher={venuePicker} />
        <OwnerSectionTabs />
        {isLive && data.banner && data.banner.kind !== "none" ? (
          <BillingBanner kind={data.banner.kind} graceEndsAt={data.banner.graceEndsAt} />
        ) : null}
        {setupNeeded ? (
          <RestaurantSetup />
        ) : children.length > 0 ? (
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
          data.needsSetup ? (
            <RestaurantSetup />
          ) : (
            <LiveUnavailable />
          )
        ) : (
          <Overview
            restaurantId={restaurant.id}
            live={live?.overview ?? null}
            published={data.published}
          />
        )}
      </div>
      <OwnerTabs />
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

function NextSteps() {
  return (
    <section className="builder-panel">
      <h2>Next steps</h2>
      <p>Your restaurant is private (draft) until you publish it. Guests cannot find it yet.</p>
      <div className="page-actions">
        <a className="builder-secondary" href="/app/menu">
          Add your menu
        </a>
        <a className="builder-secondary" href="/app/loyalty">
          Set your loyalty card
        </a>
        <a className="builder-secondary" href="/app/team">
          Add your team and pair the till
        </a>
        <a className="builder-secondary" href="/app/qr">
          Print your QR
        </a>
      </div>
    </section>
  );
}

const PAGE_ADDRESS_PATTERN = /[^a-z0-9]+/g;

/** Suggest a page address from the restaurant name, e.g. "Daily Grind" becomes "daily-grind". */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(PAGE_ADDRESS_PATTERN, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

function RestaurantSetup() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("Johannesburg");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : suggestSlug(name);

  useEffect(() => {
    const candidate = effectiveSlug;
    if (!candidate) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkSlugFn({ data: { slug: candidate } })
        .then((result) => {
          if (cancelled) return;
          setStatus(result.message);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveSlug]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await createRestaurantFn({
        data: { name, slug: effectiveSlug, suburb, city },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Reload so the viewer and the owner shell pick up the new restaurant.
      window.location.assign("/app");
    } catch {
      setError("We could not create your restaurant. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Get started"
        title="Set up your restaurant"
        intro="Tell us about your restaurant. You can change everything later. It stays private until you publish it."
      />
      <form className="builder-panel" onSubmit={create}>
        <FormField label="Restaurant name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </FormField>
        <FormField
          label="Page address"
          hint={status ?? "Letters, numbers and single hyphens. 3 to 40 characters."}
        >
          <input
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value.toLowerCase());
            }}
            maxLength={40}
            required
          />
        </FormField>
        <FormField label="Suburb">
          <input
            value={suburb}
            onChange={(event) => setSuburb(event.target.value)}
            maxLength={80}
          />
        </FormField>
        <FormField label="City">
          <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} />
        </FormField>
        {error && <p role="alert">{error}</p>}
        <p className="demo-data-note">
          This login becomes your restaurant login. To keep your own guest cards, sign up with a
          different email for your restaurant.
        </p>
        <div className="page-actions">
          <button type="submit" className="builder-primary" disabled={saving}>
            Create my restaurant
          </button>
        </div>
      </form>
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

function Overview({
  restaurantId,
  live,
  published,
}: {
  restaurantId: string;
  live: Overview | null;
  published: boolean;
}) {
  if (live) {
    return (
      <>
        <LivePublishCard />
        {published ? null : <NextSteps />}
        <OverviewBody data={live} />
      </>
    );
  }
  return <DemoHome restaurantId={restaurantId} />;
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
              <a className="builder-secondary" href="/app/campaigns/new">
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
