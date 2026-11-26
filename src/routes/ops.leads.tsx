import { failureMessage } from "@/lib/live-ops-inbox";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import type { Lead, LeadKind, LeadStatus } from "@/data/types";
import { withChildren } from "@/lib/nested";
import { getDataModeFn } from "@/server/live";
import { listLeadsFn } from "@/server/live-ops-inbox-fns";
import { LiveOpsLeads } from "@/components/patron/live/ops/LiveOpsLeads";

const OpsLeadsPage = withChildren(OpsLeads);
export const Route = createFileRoute("/ops/leads")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listLeadsFn({ data: { status: "", search: "", limit: 50, offset: 0 } }) };
  },
  component: withChildren(LiveOrDemoLeads),
});

function LiveOrDemoLeads() {
  const { mode, live } = Route.useLoaderData();
  if (mode === "live" && live?.ok) return <LiveOpsLeads initial={live.rows} />;
  if (mode === "live") return <p className="demo-data-note">{failureMessage(live) ?? "Could not load enquiries."}</p>;
  return <OpsLeadsPage />;
}

const KIND_LABELS: Record<LeadKind, string> = {
  owner: "Restaurant owner",
  diner: "Diner",
  other: "Something else",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  replied: "Replied",
  closed: "Closed",
};

function OpsLeads() {
  const state = useDemoState();
  const session = state.session;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [kind, setKind] = useState<LeadKind | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const result = api.enquiries.list({
    session,
    filters: { search, status, kind },
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Enquiries" title="We could not open the inbox." intro={result.error.message} />
      </main>
    );
  }
  const inbox = result.data;
  const selected = inbox.leads.find((lead) => lead.id === selectedId) ?? inbox.leads[0] ?? null;

  const select = (lead: Lead) => {
    setSelectedId(lead.id);
    setNotes(lead.adminNotes ?? "");
    setNotice("");
    setCopied(false);
  };

  const changeStatus = (lead: Lead, next: LeadStatus) => {
    const saved = api.enquiries.update({ id: lead.id, status: next, session });
    setNotice(saved.ok ? `Marked ${STATUS_LABELS[next].toLowerCase()}.` : saved.error.message);
  };

  const saveNotes = (lead: Lead) => {
    const saved = api.enquiries.update({ id: lead.id, notes, session });
    setNotice(saved.ok ? "Notes saved." : saved.error.message);
  };

  const copy = async (lead: Lead) => {
    const text = api.enquiries.details(lead);
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
        title="Enquiries from the website."
        intro="Every completed contact form, owner or diner, with the full answers. Reference numbers make a call easy to follow up."
      />

      <StatGrid>
        <StatCard value={inbox.counts.new} label="New" hint="Nobody has replied yet." />
        <StatCard value={inbox.counts.replied} label="Replied" hint="A person has answered." />
        <StatCard value={inbox.counts.closed} label="Closed" hint="Done or no longer needed." />
        <StatCard value={inbox.total} label="Shown" hint="After the filters below." />
      </StatGrid>

      <section className="builder-panel">
        <div className="inbox-toolbar">
          <FormField label="Search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, name, place, phone or suburb"
            />
          </FormField>
          <FormField label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | "all")}>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="replied">Replied</option>
              <option value="closed">Closed</option>
            </select>
          </FormField>
          <FormField label="Type">
            <select value={kind} onChange={(event) => setKind(event.target.value as LeadKind | "all")}>
              <option value="all">All types</option>
              <option value="owner">Restaurant owners</option>
              <option value="diner">Diners</option>
              <option value="other">Something else</option>
            </select>
          </FormField>
        </div>
      </section>

      {inbox.leads.length === 0 ? (
        <EmptyState
          title="No enquiries match"
          hint="Try a different status, type or search. New website enquiries appear here with a reference number."
        />
      ) : (
        <div className="inbox-layout">
          <section className="builder-panel inbox-list" aria-label="Enquiries">
            <ul>
              {inbox.leads.map((lead) => (
                <li key={lead.id}>
                  <button
                    className={`inbox-row${selected?.id === lead.id ? " is-active" : ""}`}
                    aria-pressed={selected?.id === lead.id}
                    onClick={() => select(lead)}
                  >
                    <span className="inbox-row-top">
                      <strong>{lead.restaurantName || lead.reference}</strong>
                      <Badge tone={lead.status === "new" ? "active" : lead.status === "replied" ? "sent" : undefined}>
                        {STATUS_LABELS[lead.status]}
                      </Badge>
                    </span>
                    <span className="inbox-row-meta">
                      {lead.reference} · {KIND_LABELS[lead.kind]} ·{" "}
                      {new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium" }).format(new Date(lead.createdAt))}
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
                    {selected.reference}
                  </p>
                  <h2>{selected.restaurantName || "Enquiry"}</h2>
                  <p className="demo-data-note">
                    {KIND_LABELS[selected.kind]} ·{" "}
                    {new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg",
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date(selected.createdAt))}
                  </p>
                </div>
                <div className="page-actions">
                  <button className="builder-secondary" onClick={() => void copy(selected)}>
                    {copied ? "Copied" : "Copy details"}
                  </button>
                  <a className="builder-secondary" href={`mailto:${selected.email ?? ""}`}>
                    Reply by email
                  </a>
                </div>
              </div>

              <div className="inbox-status" role="group" aria-label="Enquiry status">
                {(["new", "replied", "closed"] as LeadStatus[]).map((value) => (
                  <button
                    key={value}
                    className={`reports-range-button${selected.status === value ? " is-active" : ""}`}
                    aria-pressed={selected.status === value}
                    onClick={() => changeStatus(selected, value)}
                  >
                    {STATUS_LABELS[value]}
                  </button>
                ))}
              </div>

              <dl className="inbox-answers">
                <Answer label="Name" value={selected.contactName} />
                <Answer label="Phone or WhatsApp" value={selected.phone} />
                <Answer label="Email" value={selected.email} />
                <Answer label="Role" value={selected.role} />
                <Answer label="Type of place" value={selected.venueType} />
                <Answer label="Suburb" value={selected.suburb} />
                <Answer label="Quietest day or time" value={selected.quietTime} />
                <Answer label="Guests a week" value={selected.weeklyGuests} />
                <Answer label="Plan interest" value={selected.planInterest} />
                <Answer
                  label="Wants a visit"
                  value={selected.kind === "owner" ? (selected.visitWanted ? "Yes" : "No") : undefined}
                />
                <Answer label="Preferred day" value={selected.preferredDay} />
                <Answer label="Message" value={selected.message} />
                <Answer
                  label="Consent"
                  value={
                    selected.consent
                      ? `Given ${selected.consentAt ? new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.consentAt)) : ""}`
                      : "Not given"
                  }
                />
              </dl>

              <FormField label="Notes for the team" hint="Only the Patron team can see this. Saved with the enquiry.">
                <textarea
                  rows={4}
                  value={notes}
                  maxLength={1000}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Who called, what was agreed, what happens next"
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

      <section className="builder-panel">
        <h2>Places guests asked for</h2>
        <p className="demo-data-note">
          Counted from diner enquiries only. A high count is a good place to approach next.
        </p>
        {inbox.placesGuestsAskedFor.length === 0 ? (
          <EmptyState title="No diner asks yet" hint="Diner enquiries show the place they want and its suburb." />
        ) : (
          <ul className="reports-rank">
            {inbox.placesGuestsAskedFor.map((place) => (
              <li key={place.name}>
                <span>{place.name}</span>
                <strong>
                  {place.count} ask{place.count === 1 ? "" : "s"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Answer({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
