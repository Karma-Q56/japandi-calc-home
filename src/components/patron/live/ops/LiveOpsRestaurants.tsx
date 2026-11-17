import { useState } from "react";
import { DataTable, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { listRestaurantsFn } from "@/server/live-ops-restaurants-fns";
import { formatRandFromCents, isLowCredit, planLabel, statusLabel } from "@/lib/live-ops-restaurants";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  suburb: string;
  members: number;
  last_stamp_at: string | null;
  credit_cents: number;
  owner_email: string | null;
  active_locations: number;
};

const dateLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(iso)) : "not set";

const STATUSES = ["all", "draft", "active", "paused", "closed"] as const;

/** Live restaurant list. Shows only real rows; an empty list says so. */
export function LiveOpsRestaurants(props: { initial: { ok: true; rows: Row[] } | { ok: false; message: string } }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [result, setResult] = useState(props.initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    setMessage(null);
    const next = await listRestaurantsFn({
      data: { search, status: status === "all" ? "" : (status as "draft" | "active" | "paused" | "closed"), limit: 50, offset: 0 },
    });
    setResult(next as typeof result);
    if (!next.ok) setMessage(next.message);
    setBusy(false);
  }

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Restaurants"
        intro="Every restaurant on Patron, with its plan, guests, recent activity and SMS credit."
        actions={
          <a className="builder-primary" href="/ops/restaurants/new">
            Add a restaurant
          </a>
        }
      />
      <div>
        <FormField label="Search by name, slug or owner email">
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </FormField>
        <FormField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All statuses" : statusLabel(item)}
              </option>
            ))}
          </select>
        </FormField>
        <button className="builder-secondary" onClick={apply} disabled={busy}>
          Show results
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {!result.ok ? (
        <p role="alert">{result.message}</p>
      ) : result.rows.length === 0 ? (
        <EmptyState title="No restaurants match" hint="Try a different search or status. Live data only; nothing is shown as a sample." />
      ) : (
        <DataTable
          caption="All restaurants with plan, guests, recent activity and SMS credit"
          rows={result.rows}
          columns={[
            {
              key: "restaurant",
              header: "Restaurant",
              cell: (row) => (
                <a href={`/ops/restaurants/${row.id}`}>
                  <strong>{row.name}</strong>
                  <small>/{row.slug}</small>
                </a>
              ),
            },
            { key: "status", header: "Status", cell: (row) => statusLabel(row.status) },
            { key: "plan", header: "Plan", cell: (row) => planLabel(row.plan) },
            { key: "members", header: "Guests", cell: (row) => row.members },
            { key: "lastStamp", header: "Last stamp", cell: (row) => dateLabel(row.last_stamp_at) },
            {
              key: "credit",
              header: "SMS credit",
              cell: (row) => (
                <>
                  {formatRandFromCents(row.credit_cents)}
                  {isLowCredit(row.credit_cents) ? <small> Low</small> : null}
                </>
              ),
            },
          ]}
        />
      )}
    </main>
  );
}
