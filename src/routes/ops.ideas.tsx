import { failureMessage } from "@/lib/live-ops-inbox";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type IdeaFilters } from "@/domain/ideas";
import type { Idea, IdeaStatus } from "@/data/types";

import { withChildren } from "@/lib/nested";
import { getDataModeFn } from "@/server/live";
import { listIdeasFn } from "@/server/live-ops-inbox-fns";
import { LiveOpsIdeas } from "@/components/patron/live/ops/LiveOpsIdeas";

const OpsIdeasPage = withChildren(OpsIdeas);
export const Route = createFileRoute("/ops/ideas")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listIdeasFn({ data: { status: "", limit: 50, offset: 0 } }) };
  },
  head: () => ({
    meta: [{ title: "Ideas inbox | Patron" }],
  }),
  component: withChildren(LiveOrDemoIdeas),
});

function LiveOrDemoIdeas() {
  const { mode, live } = Route.useLoaderData();
  if (mode === "live" && live?.ok) return <LiveOpsIdeas initial={live.rows} />;
  if (mode === "live") return <p className="demo-data-note">{failureMessage(live) ?? "Could not load ideas."}</p>;
  return <OpsIdeasPage />;
}

function OpsIdeas() {
  const state = useDemoState();
  const session = state.session;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IdeaStatus | "all">("all");
  const [suburb, setSuburb] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const filters: IdeaFilters = { search, status, suburb };
  const result = api.ideas.list({ session, filters });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Ideas inbox" title="We could not open the inbox." intro={result.error.message} />
      </main>
    );
  }
  const inbox = result.data;
  const selected = inbox.ideas.find((idea) => idea.id === selectedId) ?? inbox.ideas[0] ?? null;

  const select = (idea: Idea) => {
    setSelectedId(idea.id);
    setNotes(idea.adminNotes ?? "");
    setNotice("");
    setCopied(false);
  };

  const changeStatus = (idea: Idea, next: IdeaStatus) => {
    const saved = api.ideas.update({ id: idea.id, status: next, session });
    setNotice(saved.ok ? `Marked ${IDEA_STATUS_LABELS[next].toLowerCase()}.` : saved.error.message);
  };

  const saveNotes = (idea: Idea) => {
    const saved = api.ideas.update({ id: idea.id, notes, session });
    setNotice(saved.ok ? "Notes saved." : saved.error.message);
  };

  const copy = async (idea: Idea) => {
    const text = api.ideas.details(idea);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setNotice("Details copied. Paste them into WhatsApp or an email.");
    } catch {
      setNotice("Copy failed. Select the details and copy them by hand.");
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Ideas from guests."
        intro="Places diners want on Patron next, counted and grouped by suburb. There are no contact details here by design; the ask page does not collect them."
      />

      <StatGrid>
        <StatCard value={inbox.counts.new} label="New" hint="Nobody has looked at them yet." />
        <StatCard value={inbox.counts.exploring} label="Exploring" hint="The Patron team is talking to the place." />
        <StatCard value={inbox.counts.added} label="Added" hint="The place has joined Patron." />
        <StatCard value={inbox.total} label="Shown" hint="After the filters below." />
      </StatGrid>

      <section className="builder-panel">
        <div className="inbox-toolbar">
          <FormField label="Search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Place, suburb or note"
            />
          </FormField>
          <FormField label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as IdeaStatus | "all")}>
              <option value="all">All statuses</option>
              {IDEA_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {IDEA_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Suburb">
            <select value={suburb} onChange={(event) => setSuburb(event.target.value)}>
              <option value="all">All suburbs</option>
              {inbox.suburbs.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      {inbox.ideas.length === 0 ? (
        <EmptyState
          title="No ideas match"
          hint="Try a different status or suburb. New guest asks appear here as soon as they are sent."
        />
      ) : (
        <div className="inbox-layout">
          <section className="builder-panel inbox-list" aria-label="Ideas">
            <ul>
              {inbox.ideas.map((idea) => (
                <li key={idea.id}>
                  <button
                    className={`inbox-row${selected?.id === idea.id ? " is-active" : ""}`}
                    aria-pressed={selected?.id === idea.id}
                    onClick={() => select(idea)}
                  >
                    <span className="inbox-row-top">
                      <strong>{idea.place}</strong>
                      <Badge tone={idea.status === "new" ? "active" : idea.status === "exploring" ? "sent" : undefined}>
                        {IDEA_STATUS_LABELS[idea.status]}
                      </Badge>
                    </span>
                    <span className="inbox-row-meta">
                      {idea.suburb} · {idea.asks} ask{idea.asks === 1 ? "" : "s"} ·{" "}
                      {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(idea.createdAt))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected && (
            <section className="builder-panel inbox-detail" aria-live="polite">
              <div className="inbox-detail-head">
                <div>
                  <p className="eyebrow">
                    <span className="eyebrow-line" />
                    {selected.suburb}
                  </p>
                  <h2>{selected.place}</h2>
                  <p className="demo-data-note">
                    {selected.asks} ask{selected.asks === 1 ? "" : "s"} ·{" "}
                    {new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short" }).format(
                      new Date(selected.createdAt),
                    )}
                  </p>
                </div>
                <div className="page-actions">
                  <button className="builder-secondary" onClick={() => void copy(selected)}>
                    {copied ? "Copied" : "Copy details"}
                  </button>
                </div>
              </div>

              <div className="inbox-status" role="group" aria-label="Idea status">
                {IDEA_STATUSES.map((value) => (
                  <button
                    key={value}
                    className={`reports-range-button${selected.status === value ? " is-active" : ""}`}
                    aria-pressed={selected.status === value}
                    onClick={() => changeStatus(selected, value)}
                  >
                    {IDEA_STATUS_LABELS[value]}
                  </button>
                ))}
              </div>

              <dl className="inbox-answers">
                <Detail label="Place" value={selected.place} />
                <Detail label="Suburb" value={selected.suburb} />
                <Detail label="Guest note" value={selected.note} />
                <Detail label="Name the guest gave" value={selected.name} />
                <Detail
                  label="Contact details"
                  value="None. The ask page does not collect phone numbers or emails."
                />
              </dl>

              <FormField label="Notes for the team" hint="Only the Patron team can see this. Saved with the idea.">
                <textarea
                  rows={4}
                  value={notes}
                  maxLength={1000}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Who called, what the place said, what happens next"
                />
              </FormField>
              <div className="page-actions">
                <button className="builder-primary" onClick={() => saveNotes(selected)}>
                  Save notes
                </button>
              </div>
              {notice && (
                <p className="demo-data-note" role="status">
                  {notice}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
