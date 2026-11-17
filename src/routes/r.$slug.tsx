import { createFileRoute } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { getDataModeFn, getPublicPageFn } from "@/server/live";
import type { PublicPage } from "@/server/repos/contracts";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import { johannesburgTime, venueIsOpenNow } from "@/lib/johannesburg-time";
import { ThemeProvider } from "@/theme";
import { withChildren } from "@/lib/nested";
import type { VenueSection } from "@/components/patron/PublicTemplates";
import { VenuePage } from "@/components/patron/VenuePage";
import { formatRand } from "@/lib/money";
import { BackLink } from "@/components/patron/BackLink";
import { PageIdentity } from "@/components/patron/live/PageIdentity";
import { DEFAULT_THEME } from "@/lib/live-page";
import type { Theme } from "@/data/types";

const PublicRestaurantPageWithChildren = withChildren(PublicRestaurantPage);
export const Route = createFileRoute("/r/$slug")({
  loader: async ({ params, location }) => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null as PublicPage | null, failed: false };
    // The card is the guest's own page: it reads their membership, not the venue
    // page. Skipping the venue read keeps a slow or failing venue query from
    // delaying (or blocking) a card that does not need it.
    if (location.pathname === `/r/${params.slug}/card`) {
      return { mode, live: null as PublicPage | null, failed: false };
    }
    try {
      const { page } = await getPublicPageFn({ data: { slug: params.slug } });
      return { mode, live: page, failed: false };
    } catch {
      // A live read can fail (schema drift, an outage). The card and join pages
      // under /r/$slug carry their own data, so a failed venue read must not
      // take them down with it. The child renders through the outlet instead.
      return { mode, live: null as PublicPage | null, failed: true };
    }
  },
  component: PublicRestaurantPageWithChildren,
});

function PublicRestaurantPage() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const state = useDemoState();
  if (loaderData.failed) {
    return (
      <main className="demo-hub page-width">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          Venue page unavailable
        </p>
        <h1>We couldn’t load this place.</h1>
        <p>The venue page is having a moment. Your stamp cards are not affected.</p>
        <p>
          <a href="/me">My cards</a> · <a href="/">Back to {APP_NAME}</a>
        </p>
      </main>
    );
  }
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
  // useDemoState provides the same seed snapshot on the server and first
  // client render; use it for venue time so the highlighted day cannot drift
  // during hydration. Later browser state updates carry the persisted demo clock.
  const now = state.now;
  const publicSpecials = api.special.publicFor(restaurant.id);
  const special = publicSpecials.find((item) => item.title && item.active) ?? null;
  const sections: VenueSection[] = restaurant.menuSectionIds.map((sectionId) => ({
    id: sectionId,
    name: state.sections.find((item) => item.id === sectionId)?.name ?? "Menu",
    items: state.items
      .filter((item) => item.sectionId === sectionId && item.available)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  const membership = state.session.customerId
    ? state.memberships.find(
        (item) =>
          item.customerId === state.session.customerId && item.restaurantId === restaurant.id,
      )
    : undefined;
  return (
    <ThemeProvider theme={restaurant.theme}>
      <VenuePage
        restaurant={restaurant}
        sections={sections}
        special={special}
        open={venueIsOpenNow(restaurant.hours, now)}
        now={now}
        {...(membership ? { membership } : {})}
        joinHref={`/r/${slug}/join?src=link`}
      />
    </ThemeProvider>
  );
}

/** Live-mode public page (DATA_MODE=live): rendered from Postgres through the
 *  getPublicPage server function instead of the demo repo. Demo rendering above
 *  is unchanged. */
function LivePublicPage({ page, slug }: { page: PublicPage; slug: string }) {
  // A restaurant that never designed its card stores an empty theme, so fill in calm defaults.
  const theme = { ...DEFAULT_THEME, ...(page.theme as Partial<Theme>) } as Theme;
  const sections = new Map<string, { name: string; items: typeof page.menu }>();
  for (const item of page.menu) {
    const key = item.sectionId ?? "menu";
    const group = sections.get(key) ?? { name: item.sectionName ?? "Menu", items: [] };
    group.items.push(item);
    sections.set(key, group);
  }
  return (
    <ThemeProvider theme={theme}>
    <main className="venue-page">
      <div className="venue-live-back">
        <BackLink to="/find" label="Find a restaurant" />
      </div>
      <PageIdentity
        name={page.name}
        suburb={page.suburb}
        tagline={typeof theme.tagline === "string" ? theme.tagline : ""}
        about={page.aboutText ?? ""}
        address={page.address ?? ""}
        hours={page.hours}
        logoUrl={typeof theme.logo === "string" && theme.logo.startsWith("/r/") ? theme.logo : null}
      />
      <section className="guest-section">
        <h2>
          Collect {page.stampsRequired} stamps, earn {page.rewardDescription}
        </h2>
        <a className="venue-button" href={`/r/${slug}/join?src=link`}>
          Join our card
        </a>
      </section>
      {page.branches.length > 1 ? (
        <section className="guest-section">
          <h2>Our branches</h2>
          <ul>
            {page.branches.map((branch) => (
              <li key={branch.id}>
                {branch.name}
                {branch.suburb ? `, ${branch.suburb}` : ""}
                {branch.isMain ? " (main)" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {[...sections.values()].map((group) => (
        <section className="guest-section" key={group.name}>
          <h2>{group.name}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                {item.name}
                {item.priceCents != null && item.priceCents > 0
                  ? ` · ${formatRand(item.priceCents)}`
                  : ""}
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
    </ThemeProvider>
  );
}
