import { useState } from "react";
import { EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { listOutboxFn, outboxSummaryFn } from "@/server/live-ops-inbox-fns";
import type { OutboxRow, OutboxSummary } from "@/server/live-ops-inbox";
import { outboxStatusLabel } from "@/lib/live-ops-inbox";
import { formatRand } from "@/lib/money";

// Live operator outbox: SMS messages with a status filter. Phones arrive already masked
// (country code and last three digits), so they are never shown in full here.

const STATUSES = ["queued", "sending", "sent", "delivered", "failed", "skipped"] as const;

export function LiveOpsOutbox({ initial, summary }: { initial: OutboxRow[]; summary: OutboxSummary }) {
  const [rows, setRows] = useState(initial);
  const [counts, setCounts] = useState(summary);
  const [status, setStatus] = useState<"" | (typeof STATUSES)[number]>("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const filter = async (next: typeof status) => {
    setStatus(next);
    setBusy(true);
    const result = await listOutboxFn({ data: { status: next, limit: 50, offset: 0 } });
    setBusy(false);
    if (result.ok) setRows(result.rows);
    else setNotice(result.message ?? "Could not load messages.");
  };

  const refreshCounts = async () => {
    const result = await outboxSummaryFn();
    if (result.ok) setCounts(result.rows);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="SMS outbox."
        intro="Every SMS sent or queued for guests, and what happened to it. Phone numbers are masked."
      />

      <StatGrid>
        <StatCard value={counts.queued} label="Waiting to send" hint="Waiting for the dispatcher." />
        <StatCard value={counts.sent} label="Sent" hint="Sent to the phone network." />
        <StatCard value={counts.failed} label="Failed" hint="Credit can be refunded after settle." />
        <StatCard value={counts.skipped} label="Skipped" hint="Guests who opted out are never messaged." />
      </StatGrid>

      <section className="builder-panel">
        <div className="page-actions">
          <FormField label="Status">
            <select value={status} onChange={(event) => void filter(event.target.value as typeof status)}>
              <option value="">All</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {outboxStatusLabel(value)}
                </option>
              ))}
            </select>
          </FormField>
          <button
            className="builder-secondary"
            disabled={busy}
            onClick={async () => {
              await refreshCounts();
              await filter(status);
            }}
          >
            Refresh
          </button>
        </div>

        {rows.length === 0 && <EmptyState title="No messages match." hint="Try a different status." />}
        {rows.map((row) => (
          <div className="outbox-meta" key={row.id}>
            <span>
              {row.restaurant_name} · {row.campaign_name} · {row.phone_masked}
            </span>
            <span>
              {outboxStatusLabel(row.status)}
              {row.error_code ? ` · ${row.error_code}` : ""}
            </span>
            <span>
              {row.channel === "sms"
                ? `${row.segments} segment${row.segments === 1 ? "" : "s"} · ${formatRand(row.cost_cents)}`
                : "Push, free"}
            </span>
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
