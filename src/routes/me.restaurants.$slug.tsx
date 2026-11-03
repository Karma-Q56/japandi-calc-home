import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { GuestShell } from "@/components/patron/GuestShell";
import { ThemeProvider } from "@/theme";
import { api } from "@/api";
import { SpinWheel } from "@/components/patron/SpinWheel";
import { ChallengeRow } from "@/components/patron/ChallengeRow";
import { formatRand } from "@/lib/money";
import { getDataModeFn } from "@/server/live";

export const Route = createFileRoute("/me/restaurants/$slug")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") throw redirect({ to: "/me" });
    if (
      !requireRole("guest")(demoRepo.read().session) ||
      (typeof window !== "undefined" && !demoRepo.read().session.customerId)
    ) {
      throw redirect({ to: "/login" });
    }
  },
  component: VenuePage,
});



function VenuePage() {
  const { slug } = Route.useParams();
  const state = useDemoState();
  const customerId = state.session.customerId;
  const restaurant = state.restaurants.find(
    (item) => item.slug === slug && item.status === "active",
  );
  if (!restaurant || !customerId) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>We couldn’t find that place.</h1>
          <a className="builder-primary" href="/me/restaurants">
            All restaurants
          </a>
        </section>
      </main>
    );
  }
  const membership = state.memberships.find(
    (item) => item.customerId === customerId && item.restaurantId === restaurant.id,
  );
  const sections = restaurant.menuSectionIds
    .map((sectionId) => ({
      id: sectionId,
      name: state.sections.find((item) => item.id === sectionId)?.name ?? "Menu",
      items: state.items
        .filter((item) => item.sectionId === sectionId && item.available)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((section) => section.items.length > 0);
  const publicSpecials = api.special.publicFor(restaurant.id);
  const offers = membership ? api.special.offersFor(membership.id) : null;
  const memberOffers = offers?.ok
    ? offers.data.offers.filter(({ special }) => special.kind !== "public")
    : [];
  const tier = membership ? api.loyalty.tierState(state, membership) : null;
  const challenges = membership ? api.loyalty.challenges(state, membership) : [];

  return (
    <ThemeProvider theme={restaurant.theme}>
      <GuestShell back={{ to: "/me/restaurants", label: "Restaurants" }}>
        <section className="venue-hero-card">
          <span className="gx-note">
            {restaurant.suburb} · {restaurant.theme.tagline}
          </span>
          <h1>{restaurant.name}</h1>
          <p>
            {restaurant.stampsRequired} stamps for {restaurant.rewardDescription}.
          </p>
          {membership ? (
            <div className="card-badges">
              <span className={`tier-pill tier-${tier?.tier ?? "new"}`}>
                {api.loyalty.tierLabel(tier?.tier ?? "new")}
              </span>
              <span className="gx-note">
                {membership.stampsCurrent} of {restaurant.stampsRequired} stamps
              </span>
            </div>
          ) : (
            <a className="builder-primary" href={`/r/${slug}/join`}>
              Join the card
            </a>
          )}
          <Link className="guest-back" to="/r/$slug" params={{ slug }}>
            See the full page
          </Link>
        </section>

        {membership && <SpinWheel membershipId={membership.id} />}

        {challenges.length > 0 && (
          <section className="gx-panel">
            <h2>Challenges</h2>
            {challenges.map(({ challenge, visits, done, claimed }) => (
              <ChallengeRow
                key={challenge.id}
                title={challenge.title}
                visits={visits}
                needed={challenge.visits}
                windowDays={challenge.windowDays}
                bonusStamps={challenge.bonusStamps}
                done={done}
                claimed={claimed}
              />
            ))}
          </section>
        )}

        <section className="gx-panel">
          <h2>Specials</h2>
          {publicSpecials.length === 0 && memberOffers.length === 0 && (
            <p className="demo-data-note">No specials this week.</p>
          )}
          {publicSpecials.map((special) => (
            <article className="guest-list-item" key={special.id}>
              <span>
                <strong>{special.title}</strong>
                <small>{special.body}</small>
                <small>Everyone · Code {special.code}</small>
              </span>
            </article>
          ))}
          {memberOffers.map(({ special, code, redeemed }) => (
            <article className="guest-list-item" key={special.id}>
              <span>
                <strong>{special.title}</strong>
                <small>{special.body}</small>
                <small>
                  {special.kind === "targeted" ? "Just for you" : "Members only"} · Code{" "}
                  {code?.code ?? special.code ?? "not set"}
                  {redeemed ? " · Used" : ""}
                </small>
              </span>
            </article>
          ))}
        </section>

        <section className="gx-panel">
          <h2>Menu</h2>
          {sections.length === 0 && <p className="demo-data-note">The menu is being written.</p>}
          {sections.map((section) => (
            <div className="venue-menu-section" key={section.id}>
              <h3>{section.name}</h3>
              {section.items.map((item) => (
                <div className="venue-menu-item" key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <b>{formatRand(item.priceCents)}</b>
                </div>
              ))}
            </div>
          ))}
        </section>
      </GuestShell>
    </ThemeProvider>
  );
}
