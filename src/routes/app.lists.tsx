import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";

export const Route = createFileRoute("/app/lists")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [{ title: "Saved lists | Patron" }],
  }),
  component: ListsPage,
});

function ListsPage() {
  const state = useDemoState();
  const restaurantId = state.session.restaurantId;
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>Saved lists.</h1>
        <p className="demo-intro">Open this page from a restaurant tunnel.</p>
      </main>
    );
  }
  const result = api.lists.list(restaurant.id);
  const lists = result.ok ? result.data : [];
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · Saved lists
      </p>
      <h1>Groups of regulars you can reuse.</h1>
      <p className="demo-intro">
        A saved list is a set of guests you picked once, for example everyone who visited on a
        Tuesday. Tick the list when you send a campaign and it goes to exactly those guests.
        Build a new list on the Customers page.
      </p>
      <div className="page-actions">
        <a className="builder-primary" href="/app/customers">
          Build a new list
        </a>
        <a className="builder-secondary" href="/app/campaigns/new">
          Send a campaign
        </a>
      </div>
      <section className="guest-panel">
        <h2>Your lists</h2>
        {lists.length === 0 && (
          <p className="demo-data-note">
            No saved lists yet. Pick guests on the Customers page and save them as a list.
          </p>
        )}
        {lists.map((list) => {
          const members = list.membershipIds
            .map((id) => state.memberships.find((m) => m.id === id))
            .filter(Boolean);
          const names = members
            .slice(0, 6)
            .map((m) => state.customers.find((c) => c.id === m.customerId)?.name ?? "A guest");
          const updated = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
            new Date(list.updatedAt),
          );
          return (
            <div className="outbox-meta" key={list.id}>
              <span>
                <strong>{list.name}</strong> · {members.length}{" "}
                {members.length === 1 ? "guest" : "guests"} · updated {updated}
                {names.length > 0 && (
                  <small className="demo-data-note">
                    {" "}
                    {names.join(", ")}
                    {members.length > names.length ? ` and ${members.length - names.length} more` : ""}
                  </small>
                )}
              </span>
              <span className="row-actions">
                <a className="row-action is-primary" href="/app/campaigns/new">
                  Send to this list
                </a>
                <button
                  type="button"
                  className="row-action"
                  onClick={() => api.lists.deleteList({ id: list.id, restaurantId })}
                >
                  Delete
                </button>
              </span>
            </div>
          );
        })}
      </section>
      <p className="demo-data-note">
        Demo data. Deleting a list only removes the list, never the guests or their consent.
      </p>
    </main>
  );
}
