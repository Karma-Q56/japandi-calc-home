import { createFileRoute } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { getDataModeFn, getPublicPageFn } from "@/server/live";
import type { PublicPage } from "@/server/repos/contracts";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import { johannesburgTime, venueIsOpenNow } from "@/lib/johannesburg-time";
import { ThemeProvider } from "@/theme";
import { withChildren } from "@/lib/nested";
import { PublicTemplate, type VenueSection } from "@/components/patron/PublicTemplates";

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
  // useDemoState provides the same seed snapshot on the server and first
  // client render; use it for venue time so the highlighted day cannot drift
  // during hydration. Later browser state updates carry the persisted demo clock.
  const now = state.now;
  const publicSpecials = api.special.publicFor(restaurant.id);
  const special =
    publicSpecials.find((item) => item.title && item.active) ?? null;
  const sections: VenueSection[] = restaurant.menuSectionIds.map((sectionId) => ({
    id: sectionId,
    name:
      state.sections.find((item) => item.id === sectionId)?.name ?? "Menu",
    items: state.items
      .filter((item) => item.sectionId === sectionId && item.available)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  const membership = state.session.customerId
    ? state.memberships.find(
        (item) =>
          item.customerId === state.session.customerId &&
          item.restaurantId === restaurant.id,
      )
    : undefined;
  const offers = membership ? api.special.offersFor(membership.id) : null;
  const memberOffers = offers?.ok
    ? offers.data.offers
        .filter(({ special: item }) => item.kind !== "public")
        .map(({ special: item, code }) => ({
          title: item.title,
          body: item.body,
          kind: item.kind,
          code: code?.code ?? null,
        }))
    : [];

  return (
    <ThemeProvider theme={restaurant.theme}>
      <PublicTemplate
        template={restaurant.pageTemplate ?? "classic"}
        restaurant={restaurant}
        sections={sections}
        special={special}
        open={venueIsOpenNow(restaurant.hours, now)}
        now={now}
        joinHref={`/r/${slug}/join?src=link`}
        memberOffers={memberOffers}
      />
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
