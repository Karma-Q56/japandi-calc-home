import { failureMessage } from "@/lib/live-ops-inbox";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type {
  FeedbackCategory,
  FeedbackSource,
  FeedbackStatus,
} from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "@/domain/feedback";
import { EmptyState, PageHeader } from "@/components/patron/dash";

import { withChildren } from "@/lib/nested";
import { getDataModeFn } from "@/server/live";
import { listFeedbackFn } from "@/server/live-ops-inbox-fns";
import { LiveOpsFeedback } from "@/components/patron/live/ops/LiveOpsFeedback";

const OpsFeedbackPage = withChildren(OpsFeedback);
export const Route = createFileRoute("/ops/feedback")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listFeedbackFn({ data: { status: "", limit: 50, offset: 0 } }) };
  },
  component: withChildren(LiveOrDemoFeedback),
});

function LiveOrDemoFeedback() {
  const { mode, live } = Route.useLoaderData();
  if (mode === "live" && live?.ok) return <LiveOpsFeedback initial={live.rows} />;
  if (mode === "live") return <p className="demo-data-note">{failureMessage(live) ?? "Could not load feedback."}</p>;
  return <OpsFeedbackPage />;
}

function OpsFeedback() {
  const state = useDemoState();
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [source, setSource] = useState<FeedbackSource | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const inbox = api.feedback.list({
    session: state.session,
    filters: { status, category, source, search },
  });
  const items = inbox.ok ? inbox.data.items : [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  useEffect(() => {
    setNote(selected?.note ?? "");
  }, [selected?.id, selected?.note]);

  const changeStatus = (next: FeedbackStatus) => {
    if (!selected) return;
    const result = api.feedback.update({
      id: selected.id,
      status: next,
      session: state.session,
    });
    setNotice(result.ok ? "Status saved." : result.error.message);
  };

  const saveNote = () => {
    if (!selected) return;
    const result = api.feedback.update({
      id: selected.id,
      note,
      session: state.session,
    });
    setNotice(result.ok ? "Note saved." : result.error.message);
  };

  return (
    <main className="opsx-page page-width">
      <PageHeader
        eyebrow="Patron · Feedback"
        title="What people are telling us."
        intro="Bugs, feature requests and confusion from owners, diners and the public page. Senders see the status of their own note."
      />
      {!inbox.ok && <p className="demo-data-note">{inbox.error.message}</p>}
      {inbox.ok && (
        <>
          <section className="builder-panel">
            <h2>Filters</h2>
            <div className="builder-fields">
              <label className="builder-field">
                Status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as FeedbackStatus | "all")
                  }
                >
                  <option value="all">All statuses</option>
                  {FEEDBACK_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {FEEDBACK_STATUS_LABELS[value]} (
                      {inbox.data.counts[value]})
                    </option>
                  ))}
                </select>
              </label>
              <label className="builder-field">
                Category
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as FeedbackCategory | "all")
                  }
                >
                  <option value="all">All categories</option>
                  {FEEDBACK_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {FEEDBACK_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="builder-field">
                Source
                <select
                  value={source}
                  onChange={(event) =>
                    setSource(event.target.value as FeedbackSource | "all")
                  }
                >
                  <option value="all">Every source</option>
                  {(["owner", "guest", "public"] as FeedbackSource[]).map((value) => (
                    <option key={value} value={value}>
                      {FEEDBACK_SOURCE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="builder-field">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Words, contact or private note"
                />
              </label>
            </div>
            <p className="builder-hint">
              {inbox.data.total} of {Object.values(inbox.data.counts).reduce((a, b) => a + b, 0)}{" "}
              notes shown.
            </p>
          </section>

          <div className="feedback-split">
            <section className="builder-panel">
              <h2>Notes</h2>
              {items.length === 0 ? (
                <EmptyState
                  title="No notes match these filters."
                  hint="Clear a filter or search for something else."
                />
              ) : (
                <div className="feedback-list">
                  {items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`feedback-item${selected?.id === item.id ? " is-active" : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <strong>
                        {FEEDBACK_CATEGORY_LABELS[item.category]} ·{" "}
                        {FEEDBACK_STATUS_LABELS[item.status]}
                      </strong>
                      <span>{item.message}</span>
                      <small>
                        {FEEDBACK_SOURCE_LABELS[item.source]} ·{" "}
                        {formatTime(item.createdAt)}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="builder-panel feedback-detail">
              <h2>Open note</h2>
              {!selected ? (
                <p className="builder-hint">Choose a note on the left.</p>
              ) : (
                <>
                  <p>
                    <strong>{FEEDBACK_CATEGORY_LABELS[selected.category]}</strong>
                  </p>
                  <p>{selected.message}</p>
                  <p className="builder-hint">
                    From {FEEDBACK_SOURCE_LABELS[selected.source]} on{" "}
                    {formatTime(selected.createdAt)}.
                  </p>
                  {selected.contactOk && (
                    <p className="builder-hint">
                      May be contacted
                      {selected.contact ? ` at ${selected.contact}` : " through the account"}.
                    </p>
                  )}
                  {selected.screenshot && (
                    <img
                      className="feedback-shot"
                      src={selected.screenshot.dataUrl}
                      alt="Picture sent with this note"
                    />
                  )}
                  <label className="builder-field">
                    Status
                    <select
                      value={selected.status}
                      onChange={(event) =>
                        changeStatus(event.target.value as FeedbackStatus)
                      }
                    >
                      {FEEDBACK_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {FEEDBACK_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="builder-field">
                    Private note
                    <textarea
                      rows={4}
                      value={note}
                      maxLength={1000}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Only the Patron team sees this."
                    />
                  </label>
                  <div className="page-actions">
                    <button className="builder-primary" onClick={saveNote}>
                      Save note
                    </button>
                  </div>
                </>
              )}
              {notice && (
                <p role="status" className="demo-data-note">
                  {notice}
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}
