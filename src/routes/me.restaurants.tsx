import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { withChildren } from "@/lib/nested";
import { VenueCard } from "@/components/patron/VenueCard";
import { GuestShell } from "@/components/patron/GuestShell";
import { PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { api } from "@/api";
import { getDataModeFn } from "@/server/live";

const RestaurantsWithChildren = withChildren(RestaurantsPage);

export const Route = createFileRoute("/me/restaurants")({
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
  component: RestaurantsWithChildren,
});

function RestaurantsPage() {
  const state = useDemoState();
  const customerId = state.session.customerId;
  const customer = customerId ? state.customers.find((item) => item.id === customerId) : undefined;
  if (!customer) {
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>No guest session yet.</h1>
          <p>Choose a guest from the demo hub first.</p>
          <a className="builder-primary" href="/">
            Back to Patron
          </a>
        </section>
      </main>
    );
  }
  const joined = state.memberships.filter((item) => item.customerId === customer.id);
  const discover = state.restaurants.filter(
    (restaurant) =>
      restaurant.status === "active" &&
      !joined.some((membership) => membership.restaurantId === restaurant.id),
  );

  const firstName = customer.name.split(" ")[0];
  return (
    <GuestShell title={customer.name}>
      <PageHeader
        eyebrow="Restaurants"
        title={`Hi ${firstName}`}
        intro="The places you collect stamps at, and other places in the demo you can join."
      />
      <StatGrid>
        <StatCard
          value={joined.length}
          label={joined.length === 1 ? "place joined" : "places joined"}
        />
        <StatCard
          value={discover.length}
          label={discover.length === 1 ? "place to discover" : "places to discover"}
        />
      </StatGrid>

      <section className="restaurant-list">
        <h2>Your places</h2>
        {joined.length === 0 && (
          <p className="demo-data-note">Join a restaurant and it will appear here.</p>
        )}
        <div className="fd-grid">
          {joined.map((membership) => {
            const restaurant = state.restaurants.find(
              (item) => item.id === membership.restaurantId,
            )!;
            const tier = api.loyalty.tierState(state, membership);
            const challenges = api.loyalty.challenges(state, membership);
            const done = challenges.filter((item) => item.done && !item.claimed).length;
            const spins = api.spin.state(membership.id);
            const rewardsReady = state.rewards.filter(
              (item) => item.membershipId === membership.id && !item.redeemedAt,
            ).length;
            return (
              <VenueCard
                key={membership.id}
                venue={restaurant}
                href={`/me/restaurants/${restaurant.slug}`}
                buttonLabel="Open"
              >
                <span className="restaurant-tags">
                  <span className="restaurant-tag-text">
                    {membership.stampsCurrent} of {restaurant.stampsRequired} stamps
                  </span>
                  <span className={`tier-pill tier-${tier.tier}`}>
                    {api.loyalty.tierLabel(tier.tier)}
                  </span>
                  {rewardsReady > 0 && (
                    <span className="reward-pill">{rewardsReady} reward ready</span>
                  )}
                  {done > 0 && <span className="challenge-pill">{done} challenge earned</span>}
                  {spins.earned > 0 && (
                    <span className="spin-pill">
                      {spins.earned} spin{spins.earned === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              </VenueCard>
            );
          })}
        </div>
      </section>

      <section className="restaurant-list">
        <h2>Discover in demo</h2>
        <div className="fd-grid">
          {discover.map((restaurant) => (
            <VenueCard
              key={restaurant.id}
              venue={restaurant}
              href={`/me/restaurants/${restaurant.slug}`}
            />
          ))}
        </div>
      </section>
    </GuestShell>
  );
}
