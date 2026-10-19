import { withChildren } from "@/lib/nested";
import { createFileRoute } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { getDataModeFn, getPublicPageFn } from "@/server/live";
import type { PublicPage } from "@/server/repos/contracts";
import { api } from "@/api";
import { APP_NAME, TIMEZONE } from "@/config/app";
import { clock } from "@/lib/clock";
import { ThemeProvider } from "@/theme";
import { clientRegistry } from "@/clients/registry";
import { LoyaltyCard } from "@/components/patron/LoyaltyCard";
import cafePhoto from "@/assets/cafe-hero.jpg";
import dishPhoto from "@/assets/dish.jpg";

const PublicRestaurantPageWithChildren = withChildren(PublicRestaurantPage);
export const Route = createFileRoute("/r/$slug")({
  loader: async ({ params }) => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null as PublicPage | null };
    const { page } = await getPublicPageFn({ data: { slug: params.slug } });
    return { mode, live: page };
  },
  component: PublicRestaurantPageWithChildren,
});

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

function todayName(now: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
  }).format(new Date(now));
}

function openNow(
  hours: Record<string, { open: string; close: string } | null>,
  now: number,
): boolean {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const today = hours[todayName(now)];
  return !!today && time >= today.open && time < today.close;
}

function PublicRestaurantPage() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const state = useDemoState();
  if (loaderData.live) return <LivePublicPage page={loaderData.live} slug={slug} />;
  const result = api.restaurant.getBySlug(slug);
  const restaurant = result.ok ? result.data : null;
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          404 · Restaurant not found
        </p>
        <h1>We couldn’t find that place.</h1>
        <a href="/">Back to {APP_NAME}</a>
      </main>
    );
  }
  const now = clock.now();
  const today = todayName(now);
  const special = state.specials.find(
    (item) =>
      restaurant.specialIds.includes(item.id) &&
      item.active &&
      new Date(item.startsAt).getTime() <= now &&
      new Date(item.endsAt).getTime() >= now,
  );
  const isCustom = clientRegistry[slug]?.publicPage === "daily-grind";
  const join = (
    <a className="venue-button" href={`/r/${slug}/join?src=link`}>
      Join our card
    </a>
  );
  const blocks = restaurant.pageConfig.filter((block) => block.enabled);

  const renderBlock = (type: string) => {
    switch (type) {
      case "hero":
        return (
          <section
            className="vp-hero venue-hero-photo"
            key={type}
            style={{ ["--vp-photo" as string]: `url(${isCustom ? cafePhoto : dishPhoto})` }}
          >
            <div className="vp-hero-inner">
              {restaurant.theme.logo && (
                <img className="venue-logo" src={restaurant.theme.logo} alt="" />
              )}
              <span className={`open-status ${openNow(restaurant.hours, now) ? "is-open" : ""}`}>
                {openNow(restaurant.hours, now) ? "Open now" : "Closed now"} · {restaurant.suburb}
              </span>
              <h1>{restaurant.name}</h1>
              <p>{restaurant.theme.tagline}</p>
              <div className="vp-actions">
                {join}
                <a className="vp-ghost" href="#menu">
                  See the menu
                </a>
              </div>
            </div>
          </section>
        );
      case "about":
        return (
          <section className="venue-section" key={type}>
            <span className="eyebrow">A little about us</span>
            <h2>Made for good days and familiar faces.</h2>
            <p>
              Find us in {restaurant.suburb}, Johannesburg. Come in for a favourite and stay for a
              while.
            </p>
          </section>
        );
      case "hours":
        return (
          <section className="venue-section" key={type}>
            <span className="eyebrow">Opening hours</span>
            <h2>{openNow(restaurant.hours, now) ? "Open now" : "See you soon"}</h2>
            <div className="venue-hours">
              {Object.entries(restaurant.hours).map(([day, hour]) => (
                <div key={day} className={day === today ? "today" : undefined}>
                  <span>{day}</span>
                  <strong>{hour ? `${hour.open}–${hour.close}` : "Closed"}</strong>
                </div>
              ))}
            </div>
          </section>
        );
      case "menu":
        return (
          <section className="venue-section" id="menu" key={type}>
            <span className="eyebrow">On the menu</span>
            <h2>House favourites.</h2>
            {restaurant.menuSectionIds.map((sectionId) => {
              const section = state.sections.find((item) => item.id === sectionId);
              const items = state.items
                .filter((item) => item.sectionId === sectionId && item.available)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div className="venue-menu-section" key={sectionId}>
                  <h3>{section?.name}</h3>
                  {items.map((item) => (
                    <div className="venue-menu-item" key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </span>
                      <b>{money(item.priceCents)}</b>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        );
      case "special":
        return special ? (
          <section className="venue-special" key={type}>
            <span className="eyebrow">This week at our place</span>
            <h2>{special.title}</h2>
            <p>{special.body}</p>
            <small>
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeZone: TIMEZONE,
              }).format(new Date(special.startsAt))}{" "}
              –{" "}
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeZone: TIMEZONE,
              }).format(new Date(special.endsAt))}
            </small>
          </section>
        ) : null;
      case "join":
        return (
          <section className="venue-join" key={type}>
            <h2>Collect stamps. Get {restaurant.rewardDescription}.</h2>
            <p>Join with your phone number. No app to download.</p>
            <LoyaltyCard
              theme={restaurant.theme}
              name={restaurant.name}
              filled={3}
              total={restaurant.stampsRequired}
              footnote="Your card looks like this"
            />
            {join}
          </section>
        );
      case "find-us":
        return restaurant.address ? (
          <section className="venue-section" key={type}>
            <h2>Find us</h2>
            <p>
              {restaurant.address}, {restaurant.suburb}
            </p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(
                `${restaurant.address}, ${restaurant.suburb}, Johannesburg`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Open map
            </a>
          </section>
        ) : null;
      case "gallery":
        return null;
      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={restaurant.theme}>
      <main className="venue-page">
        <header className="venue-header">
          <a href="/" aria-label={APP_NAME}>
            {restaurant.name}
          </a>
          <span>{restaurant.suburb} · Johannesburg</span>
        </header>
        {blocks.map((block) => renderBlock(block.type))}
        <footer className="venue-footer">
          {restaurant.address && <span>{restaurant.address}</span>}
          <span>Demo data · Powered by {APP_NAME}</span>
        </footer>
      </main>
    </ThemeProvider>
  );
}

/** Live-mode public page (DATA_MODE=live): rendered from Postgres through the
 *  getPublicPage server function instead of the demo repo. Demo rendering above
 *  is unchanged. */
function LivePublicPage({ page, slug }: { page: PublicPage; slug: string }) {
  const hours = page.hours as Record<string, { open: string; close: string } | null>;
  const sections = new Map<string, { name: string; items: typeof page.menu }>();
  for (const item of page.menu) {
    const key = item.sectionId ?? "menu";
    const group = sections.get(key) ?? { name: item.sectionName ?? "Menu", items: [] };
    group.items.push(item);
    sections.set(key, group);
  }
  return (
    <main className="venue-page">
      <header className="venue-header">
        <a href="/">{page.name}</a>
        {page.suburb && <span>{page.suburb} · Johannesburg</span>}
      </header>
      <section className="guest-section">
        <h2>
          Collect {page.stampsRequired} stamps, earn {page.rewardDescription}
        </h2>
        <a className="venue-button" href={`/r/${slug}/join?src=link`}>
          Join our card
        </a>
      </section>
      <section className="guest-section">
        <h2>Hours</h2>
        <ul>
          {Object.entries(hours).map(([day, span]) => (
            <li key={day}>
              {day}: {span ? `${span.open}–${span.close}` : "Closed"}
            </li>
          ))}
        </ul>
      </section>
      {[...sections.values()].map((group) => (
        <section className="guest-section" key={group.name}>
          <h2>{group.name}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                {item.name}
                {item.priceCents != null && item.priceCents > 0 ? ` · ${money(item.priceCents)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {page.specials.length > 0 && (
        <section className="guest-section">
          <h2>Specials</h2>
          <ul>
            {page.specials.map((special) => (
              <li key={special.id}>
                <strong>{special.title}</strong>
                {special.body && <p>{special.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
