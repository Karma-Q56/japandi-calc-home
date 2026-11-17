import { useState } from "react";
import { Badge, PageHeader } from "@/components/patron/dash";
import { decideCampaignFn } from "@/server/live-ops-inbox-fns";
import type { PendingCampaignRow } from "@/server/live-ops-inbox";

// Live operator campaigns: campaigns waiting for approval, with approve and reject.

export function LiveOpsCampaigns({ initial }: { initial: PendingCampaignRow[] }) {
  const [rows, setRows] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const decide = async (campaignId: string, decision: "approve" | "reject") => {
    setBusy(true);
    const result = await decideCampaignFn({
      data: { campaignId, decision, reason: reasons[campaignId] ?? "" },
    });
    setBusy(false);
    setNotice(result.message ?? "");
    if (result.ok) setRows((current) => current.filter((row) => row.id !== campaignId));
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Campaigns waiting for approval."
        intro="These campaigns are waiting for Patron approval before they can be scheduled. Approve to schedule, or reject to cancel. Nothing sends from this page directly."
      />

      <section className="builder-panel">
        <h2>Waiting for approval</h2>
        {rows.length === 0 && <p className="demo-data-note">No campaigns are waiting for approval.</p>}
        {rows.map((row) => (
          <div className="outbox-meta" key={row.id}>
            <span>
              <strong>{row.name}</strong> · {row.restaurant_name} · {row.est_recipients} guests · about R
              {Math.round(row.est_cost_cents / 100)}
            </span>
            <span>
              <Badge>Needs approval</Badge>
            </span>
            <p className="demo-data-note">{row.message_body}</p>
            <label>
              Note (optional)
              <input
                value={reasons[row.id] ?? ""}
                maxLength={300}
                onChange={(event) => setReasons({ ...reasons, [row.id]: event.target.value })}
              />
            </label>
            <div className="page-actions">
              <button className="builder-primary" disabled={busy} onClick={() => decide(row.id, "approve")}>
                Approve
              </button>
              <button className="builder-secondary" disabled={busy} onClick={() => decide(row.id, "reject")}>
                Reject
              </button>
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
