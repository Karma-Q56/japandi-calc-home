import { composerHref } from "@/lib/live-campaigns";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { Customer, Membership, SavedList } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { ConfirmDialog, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { guestDisplayName } from "@/lib/wording";
import { getDataModeFn } from "@/server/live";
import { createListFn, deleteListFn, getListsFn, renameListFn } from "@/server/live-lists-fns";
import type { LiveList } from "@/server/live-lists";

export const Route = createFileRoute("/app/lists")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getListsFn() };
  },
  head: () => ({
    meta: [{ title: "Saved lists | Patron" }],
  }),
  component: ListsPage,
});

function ListsPage() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveListsPage lists={data.live} />;
  return <DemoListsPage />;
}

function LiveListsPage({ lists }: { lists: LiveList[] | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (!lists) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Saved lists"
          title="Saved lists."
          intro="Only the owner or a manager can see saved lists. Sign in with that account to continue."
        />
      </main>
    );
  }
  const refresh = () => router.invalidate();
  const create = async () => {
    setBusy(true);
    const result = await createListFn({ data: { name, membershipIds: [] } });
    setBusy(false);
    setNotice(result.ok ? "List created. Add guests from the Customers page." : result.message);
    if (result.ok) {
      setName("");
      await refresh();
    }
  };
  const rename = async (id: string) => {
    const result = await renameListFn({ data: { id, name: renameText } });
    setNotice(result.ok ? "List renamed." : result.message);
    if (result.ok) {
      setRenaming(null);
      await refresh();
    }
  };
  const remove = async (id: string) => {
    const result = await deleteListFn({ data: { id } });
    setNotice(result.ok ? "List deleted. The guests and their consent are unchanged." : result.message);
    if (result.ok) await refresh();
  };
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Saved lists"
        title="Groups of regulars you can reuse."
        intro="A saved list is a set of guests you picked once. Tick the list when you send a campaign and it goes to exactly those guests. Add guests to a list from the Customers page."
        actions={
          <a className="builder-secondary" href="/app/campaigns/new">
            Send a campaign
          </a>
        }
      />
      <section className="builder-panel">
        <h2>New list</h2>
        <FormField label="List name" hint="Up to 80 characters.">
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <button className="builder-primary" onClick={create} disabled={busy || name.trim() === ""}>
          Create list
        </button>
      </section>
      <section className="builder-panel">
        <h2>Your lists</h2>
        {lists.length === 0 && (
          <EmptyState title="No saved lists yet." hint="Create a list above, then add guests to it from the Customers page." />
        )}
        {lists.map((list) => (
          <div className="outbox-meta" key={list.id}>
            {renaming === list.id ? (
              <span>
                <input value={renameText} maxLength={80} onChange={(event) => setRenameText(event.target.value)} aria-label="New list name" />{" "}
                <button className="row-action is-primary" onClick={() => rename(list.id)}>
                  Save name
                </button>{" "}
                <button className="row-action" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <span>
                <strong>{list.name}</strong> · {list.guestCount} {list.guestCount === 1 ? "guest" : "guests"}
              </span>
            )}
            {renaming !== list.id && (
              <span className="row-actions">
                <a className="row-action is-primary" href={composerHref({ segment: "saved_list", listId: list.id })}>
                  Send to this list
                </a>
                <button
                  type="button"
                  className="row-action"
                  onClick={() => {
                    setRenaming(list.id);
                    setRenameText(list.name);
                  }}
                >
                  Rename
                </button>
                <ConfirmDialog
                  label="Delete"
                  question="Delete this list? Only the list goes. The guests and their consent stay."
                  confirmLabel="Delete list"
                  buttonClass="row-action is-danger"
                  onConfirm={() => remove(list.id)}
                />
              </span>
            )}
          </div>
        ))}
      </section>
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}

function DemoListsPage() {
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
          const updated = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium" }).format(
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
                <a className="row-action is-primary" href={composerHref({ segment: "saved_list", listId: list.id })}>
                  Send to this list
                </a>
                <button
                  type="button"
                  className="row-action is-danger"
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
