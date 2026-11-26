import { useState } from "react";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { listLeadsFn, updateLeadFn } from "@/server/live-ops-inbox-fns";
import type { LeadRow } from "@/server/live-ops-inbox";
import { leadStatusLabel } from "@/lib/live-ops-inbox";

// Live operator enquiries: a list with a status filter and a search, and a detail panel with
// every answer the visitor gave, a status, and a private note. The note is for Patron only.
// An enquiry is a prospect asking to be contacted, so their contact details are shown.

const STATUSES = ["new", "replied", "contacted", "demo_booked", "won", "lost", "closed"] as const;
type Status = (typeof STATUSES)[number];

const dateLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "not yet";

function Answer({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

export function LiveOpsLeads({ initial }: { initial: LeadRow[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<"" | Status>("");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<Status>("new");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveLine, setSaveLine] = useState("");
  const [busy, setBusy] = useState(false);

  const open = rows.find((row) => row.id === openId) ?? null;

  const reload = async (nextStatus: "" | Status, nextSearch: string) => {
    setBusy(true);
    setLoadError("");
    const result = await listLeadsFn({ data: { status: nextStatus, search: nextSearch, limit: 50, offset: 0 } });
    setBusy(false);
    if (result.ok) {
      setRows(result.rows);
      return result.rows;
    }
    setLoadError(result.message ?? "Could not load enquiries.");
    return null;
  };

  const openLead = (lead: LeadRow) => {
    setOpenId(lead.id);
    setDraftStatus(lead.status as Status);
    setDraftNotes(lead.admin_notes ?? "");
    setSaveLine("");
  };

  const save = async () => {
    if (!open) return;
    setBusy(true);
    setSaveLine("");
    const result = await updateLeadFn({ data: { leadId: open.id, status: draftStatus, notes: draftNotes } });
    if (result.ok) {
      await reload(status, search);
      setSaveLine("Saved.");
    } else {
      setSaveLine(result.message);
    }
    setBusy(false);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Enquiries."
        intro="People who asked to be contacted through the Talk to us form. Open one to see everything they told us."
      />

      <section className="builder-panel">
        <div className="page-actions">
          <FormField label="Status">
            <select
              value={status}
              onChange={(event) => {
                const next = event.target.value as "" | Status;
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
          <FormField label="Search by reference, restaurant, name, phone or email">
            <input
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void reload(status, search);
              }}
            />
          </FormField>
          <button className="builder-secondary" disabled={busy} onClick={() => void reload(status, search)}>
            Search
          </button>
        </div>
        {loadError ? <p role="alert">{loadError}</p> : null}

        {rows.length === 0 && <EmptyState title="No enquiries match." hint="Try a different status or search." />}
        {rows.map((lead) => (
          <div className="outbox-meta" key={lead.id}>
            <span>
              <strong>{lead.reference ?? "Enquiry"}</strong> · {lead.restaurant_name} · {lead.contact_name}
              {lead.suburb ? ` · ${lead.suburb}` : ""} · {dateLabel(lead.created_at)}
            </span>
            <span>{leadStatusLabel(lead.status)}</span>
            <button
              className={lead.id === openId ? "builder-primary" : "builder-secondary"}
              onClick={() => openLead(lead)}
              aria-expanded={lead.id === openId}
            >
              Open
            </button>
          </div>
        ))}
      </section>

      {open ? (
        <section className="builder-panel" aria-label={`Enquiry ${open.reference ?? ""}`}>
          <h2>
            {open.restaurant_name} ({open.reference ?? "no reference"})
          </h2>
          <p>
            <strong>Contact:</strong> {open.contact_name},{" "}
            <a href={`tel:${open.phone}`}>{open.phone}</a>
            {open.email ? (
              <>
                , <a href={`mailto:${open.email}`}>{open.email}</a>
              </>
            ) : null}
          </p>
          <Answer label="Their role" value={open.role} />
          <Answer label="Type of place" value={open.venue_type} />
          <Answer label="Suburb" value={open.suburb} />
          <Answer label="Quiet time" value={open.quiet_time} />
          <Answer label="Guests a week" value={open.weekly_guests} />
          <Answer label="Interested in" value={open.plan_interest} />
          <Answer
            label="Wants a visit"
            value={open.visit_wanted == null ? null : open.visit_wanted ? `Yes${open.preferred_day ? `, ${open.preferred_day}` : ""}` : "No"}
          />
          <Answer label="Agreed to be contacted" value={open.consent_at ? dateLabel(open.consent_at) : null} />
          <Answer label="First reply" value={open.replied_at ? dateLabel(open.replied_at) : null} />
          {open.calculator ? (
            <>
              <h3>Calculator answers they chose to share</h3>
              <ul>
                {Object.entries(open.calculator).map(([key, value]) => (
                  <li key={key}>
                    {key.replace(/_/g, " ")}: {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <FormField label="Status">
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as Status)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {leadStatusLabel(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Private note" hint="Only Patron staff see this. Up to 1000 characters.">
            <textarea value={draftNotes} maxLength={1000} rows={4} onChange={(event) => setDraftNotes(event.target.value)} />
          </FormField>
          <button className="builder-primary" disabled={busy} onClick={() => void save()}>
            Save
          </button>
          {saveLine ? <p role="status">{saveLine}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
