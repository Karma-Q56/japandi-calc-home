import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { Customer, Membership, SavedList } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import { guestDisplayName } from "@/lib/wording";

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
        <PageHeader
          eyebrow="Saved lists"
          title="Saved lists."
          intro="Choose a venue first, then open this page again."
        />
      </main>
    );
  }
  const lists = api.audience.lists(restaurant.id);
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Saved lists`}
        title="Groups of regulars you can reuse."
        intro="A saved list is a set of guests you picked once, for example everyone who visited on a Tuesday. Tick the list when you send a campaign and it goes to exactly those guests. Build a new list on the Customers page."
        actions={
          <>
            <a className="builder-primary" href="/app/customers">
              Build a new list
            </a>
            <a className="builder-secondary" href="/app/campaigns/new">
              Send a campaign
            </a>
          </>
        }
      />
      <section className="builder-panel">
        <h2>Your lists</h2>
        {lists.length === 0 && (
          <EmptyState
            title="No saved lists yet."
            hint="Pick guests on the Customers page and save them as a list."
            action={
              <a className="builder-primary" href="/app/customers">
                Pick guests
              </a>
            }
          />
        )}
        {lists.map((list: SavedList) => {
          const members = list.membershipIds
            .map((id: string) => state.memberships.find((m: Membership) => m.id === id))
            .filter((m): m is Membership => !!m);
          const names = members
            .slice(0, 6)
            .map((m) =>
              guestDisplayName(
                state.customers.find((c: Customer) => c.id === m.customerId)?.name ?? "A guest",
              ),
            );
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
                  onClick={() => api.audience.deleteList({ id: list.id, restaurantId: restaurant.id })}
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
