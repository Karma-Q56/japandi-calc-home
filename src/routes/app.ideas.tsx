import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import { IDEA_STATUS_LABELS, type IdeaBoardPlace } from "@/domain/ideas";

export const Route = createFileRoute("/app/ideas")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager", "operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [{ title: "Ideas | Patron" }],
  }),
  component: OwnerIdeas,
});

function OwnerIdeas() {
  const state = useDemoState();
  const restaurant = state.restaurants.find((item) => item.id === state.session.restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Ideas" title="Open this page from a restaurant tunnel." />
      </main>
    );
  }
  const board = api.ideas.board({ session: state.session });
  if (!board.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Ideas" title="We could not load the ideas." intro={board.error.message} />
      </main>
    );
  }
  const total = board.data.places.reduce((sum, place) => sum + place.asks, 0);
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Ideas`}
        title="Where guests want Patron next."
        intro="Diners asked for places to join Patron. This board shows the asks in your suburb only, with no guest names, as a signal for who to chat to. Your own venue is not counted here."
      />
      {total > 0 && (
        <p className="demo-data-note" role="status">
          {total} ask{total === 1 ? "" : "s"} in {board.data.suburb} so far.
        </p>
      )}
      {board.data.places.length === 0 ? (
        <EmptyState
          title="No asks in your suburb yet."
          hint="When diners ask for a place near you, the count shows up here. Guests share asks on the public ask page."
        />
      ) : (
        <section className="builder-panel">
          <h2>Asked for in {board.data.suburb}</h2>
          <ul className="reports-rank">
            {board.data.places.map((place: IdeaBoardPlace) => (
              <li key={`${place.place}|${place.suburb}`}>
                <span>
                  {place.place}
                  <small className="demo-data-note">
                    · {IDEA_STATUS_LABELS[place.status]} · last ask{" "}
                    {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(place.latestAt))}
                  </small>
                </span>
                <strong>
                  {place.asks} ask{place.asks === 1 ? "" : "s"}
                </strong>
              </li>
            ))}
          </ul>
          <p className="demo-data-note">
            A place guests keep asking for is worth a conversation: they want loyalty traffic you are already
            building. Patron staff see the full notes on the operator ideas page.
          </p>
        </section>
      )}
    </main>
  );
}
