import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import { feedbackScreenshotFn, listFeedbackFn, setFeedbackFn } from "@/server/live-ops-inbox-fns";
import type { FeedbackRow } from "@/server/live-ops-inbox";
import { feedbackContactLabel, feedbackStatusLabel } from "@/lib/live-ops-inbox";

// Live operator feedback: list, one open note, a status and private note, and a screenshot fetched on demand.
// The screenshot never comes in the list. Contact shows only when the sender allowed it.

const STATUSES = ["new", "seen", "planned", "done", "not_now"] as const;

export function LiveOpsFeedback({ initial }: { initial: FeedbackRow[] }) {
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(selected?.status as (typeof STATUSES)[number]);
  const [note, setNote] = useState(selected?.note ?? "");
  const [picture, setPicture] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (row: FeedbackRow) => {
    setSelectedId(row.id);
    setStatus(row.status as (typeof STATUSES)[number]);
    setNote(row.note ?? "");
    setPicture(null);
    setNotice("");
  };

  const showPicture = async (feedbackId: string) => {
    setBusy(true);
    const result = await feedbackScreenshotFn({ data: { feedbackId } });
    setBusy(false);
    if (result.ok) setPicture(result.rows ?? null);
    else setNotice(result.message ?? "Could not load the picture.");
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await setFeedbackFn({ data: { feedbackId: selected.id, status, note } });
    setBusy(false);
    setNotice(result.message ?? "");
    if (result.ok) {
      const refreshed = await listFeedbackFn({ data: { status: "", limit: 50, offset: 0 } });
      if (refreshed.ok) setRows(refreshed.rows);
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Feedback."
        intro="Bugs, feature requests and confusion from owners, diners and the public page."
      />

      <div className="builder-grid">
        <section className="builder-panel">
          <h2>Notes</h2>
          {rows.length === 0 && <EmptyState title="No feedback yet." hint="Notes from owners and guests appear here." />}
          {rows.map((row) => (
            <button
              key={row.id}
              className={row.id === selectedId ? "builder-primary" : "builder-secondary"}
              onClick={() => open(row)}
            >
              {row.reference} · {row.category} · {feedbackStatusLabel(row.status)}
            </button>
          ))}
        </section>

        <section className="builder-panel">
          <h2>Open note</h2>
          {!selected && <p className="builder-hint">Choose a note on the left.</p>}
          {selected && (
            <>
              <p>
                <strong>{selected.reference}</strong> · {selected.source} · {selected.restaurant_name ?? "No restaurant"}
              </p>
              <p>{selected.message}</p>
              <p className="demo-data-note">
                Contact: {feedbackContactLabel(selected.contact, selected.contact_ok)}
              </p>
              {selected.has_screenshot && (
                <div className="page-actions">
                  {picture ? (
                    <img src={picture} alt="Picture sent with this note" style={{ maxWidth: "100%" }} />
                  ) : (
                    <button className="builder-secondary" disabled={busy} onClick={() => showPicture(selected.id)}>
                      Show picture
                    </button>
                  )}
                </div>
              )}
              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {feedbackStatusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Private note
                <textarea value={note} maxLength={500} rows={4} onChange={(event) => setNote(event.target.value)} />
              </label>
              <div className="page-actions">
                <button className="builder-primary" disabled={busy} onClick={save}>
                  Save note
                </button>
              </div>
            </>
          )}
          {notice && (
            <p className="demo-data-note" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
