import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { IDEA_STATUS_LABELS, type IdeaBoardPlace } from "@/domain/ideas";
import { getDataModeFn } from "@/server/live";
import { listOwnerIdeasFn, submitOwnerIdeaFn } from "@/server/live-admin-fns";
import type { OwnerIdeaBoardItem } from "@/server/live-admin";

export const Route = createFileRoute("/app/ideas")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager", "operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listOwnerIdeasFn() };
  },
  head: () => ({
    meta: [{ title: "Ideas | Patron" }],
  }),
  component: OwnerIdeas,
});

function OwnerIdeas() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveIdeas initial={data.live} />;
  return <DemoIdeas />;
}

/** Live ideas: ask for a place near you and see the asks in your suburb as counts only. */
function LiveIdeas({ initial }: { initial: OwnerIdeaBoardItem[] | null }) {
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [board, setBoard] = useState<OwnerIdeaBoardItem[]>(initial ?? []);

  const submit = async () => {
    setSending(true);
    const result = await submitOwnerIdeaFn({ data: { place, note } });
    setSending(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("Thanks. Your ask is on the board.");
    setPlace("");
    setNote("");
    setBoard(await listOwnerIdeasFn());
  };

  if (!initial) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Ideas" title="Ideas are not ready for this restaurant yet." intro="Please try again later." />
      </main>
    );
  }

  const total = board.reduce((sum, item) => sum + item.asks, 0);
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Ideas"
        title="Where guests want Patron next."
        intro="Diners ask for places to join Patron. This board shows the asks in your suburb as counts only, with no guest names. Tell us a place you would like to see in your area."
      />
      <section className="builder-panel">
        <h2>Ask for a place</h2>
        <FormField label="Which place?" hint="Up to 120 characters.">
          <input value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} />
        </FormField>
        <FormField label="Anything else? (optional)" hint="Up to 280 characters.">
          <textarea rows={3} value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <div className="page-actions">
          <button className="builder-primary" onClick={submit} disabled={sending}>
            Send ask
          </button>
        </div>
        {notice && (
          <p role="status" className="demo-data-note">
            {notice}
          </p>
        )}
      </section>
      {total > 0 && (
        <p className="demo-data-note" role="status">
          {total} ask{total === 1 ? "" : "s"} in your suburb so far.
        </p>
      )}
      {board.length === 0 ? (
        <EmptyState
          title="No asks in your suburb yet."
          hint="When you or diners ask for a place near you, the count shows up here."
        />
      ) : (
        <section className="builder-panel">
          <h2>Asked for in your suburb</h2>
          <ul className="reports-rank">
            {board.map((item) => (
              <li key={item.place}>
                <span>
                  {item.place}
                  <small className="demo-data-note">
                    {" "}· last ask{" "}
                    {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(item.latestAt))}
                  </small>
                </span>
                <strong>
                  {item.asks} ask{item.asks === 1 ? "" : "s"}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** Demo ideas screen. Unchanged apart from being split out of the route. */
function DemoIdeas() {
  const state = useDemoState();
  const restaurant = state.restaurants.find((item) => item.id === state.session.restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Ideas" title="Choose a venue first, then open this page again." />
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
