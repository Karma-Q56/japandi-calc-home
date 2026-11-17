import { useState } from "react";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { listLeadsFn, setLeadStatusFn } from "@/server/live-ops-inbox-fns";
import type { LeadRow } from "@/server/live-ops-inbox";
import { leadStatusLabel } from "@/lib/live-ops-inbox";

// Live operator enquiries: list with a status filter and search, and a status change.
// Guest names and phone numbers are never returned by the server, so none show here.

const STATUSES = ["new", "replied", "closed", "contacted", "demo_booked", "won", "lost"] as const;

export function LiveOpsLeads({ initial }: { initial: LeadRow[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<"" | (typeof STATUSES)[number]>("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async (nextStatus: typeof status, nextSearch: string) => {
    setBusy(true);
    const result = await listLeadsFn({ data: { status: nextStatus, search: nextSearch, limit: 50, offset: 0 } });
    setBusy(false);
    if (result.ok) setRows(result.rows);
    else setNotice(result.message ?? "Could not load enquiries.");
  };

  const changeStatus = async (leadId: string, next: (typeof STATUSES)[number]) => {
    setBusy(true);
    const result = await setLeadStatusFn({ data: { leadId, status: next } });
    setBusy(false);
    setNotice(result.message ?? "");
    if (result.ok) await reload(status, search);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Enquiries."
        intro="Enquiries from restaurant owners and diners. Guest names and phone numbers are not shown here."
      />

      <section className="builder-panel">
        <div className="page-actions">
          <FormField label="Status">
            <select
              value={status}
              onChange={(event) => {
                const next = event.target.value as typeof status;
                setStatus(next);
                void reload(next, search);
              }}
            >
              <option value="">All</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {leadStatusLabel(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Search">
            <input
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void reload(status, search);
              }}
            />
          </FormField>
          <button className="builder-secondary" disabled={busy} onClick={() => reload(status, search)}>
            Search
          </button>
        </div>

        {rows.length === 0 && <EmptyState title="No enquiries match." hint="Try a different status or search." />}
        {rows.map((lead) => (
          <div className="outbox-meta" key={lead.id}>
            <span>
              <strong>{lead.reference ?? "Enquiry"}</strong> · {lead.kind} · {lead.restaurant_name}
              {lead.suburb ? ` · ${lead.suburb}` : ""}
              {lead.plan_interest ? ` · Interested in ${lead.plan_interest}` : ""}
            </span>
            <span>{leadStatusLabel(lead.status)}</span>
            <div className="page-actions">
              {STATUSES.map((value) => (
                <button
                  key={value}
                  className={value === lead.status ? "builder-primary" : "builder-secondary"}
                  disabled={busy || value === lead.status}
                  onClick={() => changeStatus(lead.id, value)}
                >
                  {leadStatusLabel(value)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {notice && (
          <p className="demo-data-note" role="status">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
