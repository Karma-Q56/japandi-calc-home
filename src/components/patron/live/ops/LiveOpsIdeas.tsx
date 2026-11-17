import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import { listIdeasFn, setIdeaFn } from "@/server/live-ops-inbox-fns";
import type { IdeaRow } from "@/server/live-ops-inbox";
import { ideaStatusLabel } from "@/lib/live-ops-inbox";

// Live operator ideas: places guests asked for. Status and private notes can be saved.

const STATUSES = ["new", "exploring", "added"] as const;

export function LiveOpsIdeas({ initial }: { initial: IdeaRow[] }) {
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const [notes, setNotes] = useState(selected?.admin_notes ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (row: IdeaRow) => {
    setSelectedId(row.id);
    setNotes(row.admin_notes ?? "");
    setNotice("");
  };

  const changeStatus = async (next: (typeof STATUSES)[number]) => {
    if (!selected) return;
    setBusy(true);
    const result = await setIdeaFn({ data: { ideaId: selected.id, status: next, adminNotes: notes } });
    setBusy(false);
    setNotice(result.message ?? "");
    if (result.ok) await refresh();
  };

  const refresh = async () => {
    const refreshed = await listIdeasFn({ data: { status: "", limit: 50, offset: 0 } });
    if (refreshed.ok) setRows(refreshed.rows);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Ideas."
        intro="Places guests asked for. New guest asks appear here as soon as they are sent."
      />

      <div className="builder-grid">
        <section className="builder-panel">
          <h2>Asks</h2>
          {rows.length === 0 && <EmptyState title="No ideas yet." hint="New guest asks appear here." />}
          {rows.map((row) => (
            <button
              key={row.id}
              className={row.id === selectedId ? "builder-primary" : "builder-secondary"}
              onClick={() => open(row)}
            >
              {row.place} · {ideaStatusLabel(row.status)}
            </button>
          ))}
        </section>

        <section className="builder-panel">
          <h2>Detail</h2>
          {!selected && <p className="builder-hint">Choose an ask on the left.</p>}
          {selected && (
            <>
              <p>
                <strong>{selected.place}</strong>
                {selected.suburb ? ` · ${selected.suburb}` : ""} · {selected.asks} ask
                {selected.asks === 1 ? "" : "s"}
              </p>
              {selected.note && <p>{selected.note}</p>}
              <label>
                Private note
                <textarea value={notes} maxLength={500} rows={4} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <div className="page-actions">
                {STATUSES.map((value) => (
                  <button
                    key={value}
                    className={value === selected.status ? "builder-primary" : "builder-secondary"}
                    disabled={busy}
                    onClick={() => changeStatus(value)}
                  >
                    {ideaStatusLabel(value)}
                  </button>
                ))}
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
