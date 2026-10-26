import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { campaignBadge, Badge, ConfirmDialog, DataTable, EmptyState, PageHeader, PreviewBanner, StatCard, StatGrid } from "@/components/patron/dash";
import { campaignRecipients, campaignResults, messageStatusLabel, VISITS_LABEL } from "@/domain/campaigns";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { formatRand } from "@/lib/money";
import { useDemoState } from "@/data/useDemoState";

export const Route = createFileRoute("/app/campaigns/$campaignId")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: ResultsPage,
});

const CHANNEL_LABEL: Record<"sms" | "push", string> = { sms: "SMS", push: "Push" };

function ResultsPage() {
  const { campaignId } = Route.useParams();
  const state = useDemoState();
  const [notice, setNotice] = useState("");
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    return (
      <main className="demo-hub page-width">
        <EmptyState
          title="Campaign not found."
          hint="It may have been removed, or the link is out of date."
          action={<a className="builder-primary" href="/app/campaigns">Back to campaigns</a>}
        />
      </main>
    );
  }
  const results = campaignResults(state, campaign.id);
  const rows = campaignRecipients(state, campaign.id);
  const badge = campaignBadge(campaign.status);
  const sentOrLater = campaign.status === "sending" || campaign.status === "sent";
  const canApprove =
    campaign.requiresApproval && !campaign.approvedBy && state.session.role !== "operator";
  const totalCost =
    campaign.status === "sent" ? campaign.actualCostCents : (campaign.estCostCents ?? 0);
  const costHint =
    campaign.status === "sent" ? "Settled final cost" : "Estimated until the send is settled";

  const approve = () => {
    const approved = api.campaign.approve({
      campaignId: campaign.id,
      actor: "owner",
      role: state.session.role,
    });
    setNotice(approved.ok ? "Approved. It can now be confirmed." : approved.error.message);
  };
  const settle = () => {
    const settled = api.campaign.settle({ campaignId: campaign.id, actor: "owner" });
    setNotice(
      settled.ok
        ? `Settled at ${formatRand(settled.data.actualCostCents)} actual cost.`
        : settled.error.message,
    );
  };
  const cancel = () => {
    const cancelled = api.campaign.cancel({ campaignId: campaign.id, actor: "owner" });
    setNotice(cancelled.ok ? "Campaign cancelled; the reservation was released." : cancelled.error.message);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Campaign ${campaign.code}`}
        title={campaign.name}
        intro={campaign.body}
        actions={
          sentOrLater ? (
            <>
              <button className="builder-primary" onClick={settle}>
                Settle campaign
              </button>
              <ConfirmDialog
                label="Cancel"
                question="Cancel this campaign? Guests still waiting will not get it."
                confirmLabel="Cancel it"
                onConfirm={cancel}
              />
            </>
          ) : (
            <a className="builder-secondary" href="/app/campaigns">
              Back to campaigns
            </a>
          )
        }
      />
      <p className="eyebrow" aria-label="Campaign status">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </p>
      {canApprove && (
        <section className="guest-panel">
          <h2>Needs your approval</h2>
          <p className="demo-data-note">An operator drafted this. Nothing sends until you approve.</p>
          <button className="builder-primary" onClick={approve}>
            Approve campaign
          </button>
        </section>
      )}
      {campaign.status === "draft" && (
        <EmptyState
          title="Nothing sent yet. This campaign is still a draft."
          hint="Confirm it in the composer to send or schedule it. Nothing goes out until you confirm."
          action={<a className="builder-primary" href="/app/campaigns/new">New campaign</a>}
        />
      )}
      {results && (campaign.status !== "draft") && (
        <>
          <StatGrid>
            <StatCard value={results.sent} label="Messages sent" hint={`of ${campaign.recipients} recipients`} />
            <StatCard
              value={results.delivered}
              label="Delivered"
              tone={results.delivered >= results.sent ? "good" : undefined}
              hint={results.sent > 0 ? `${Math.round((results.delivered / results.sent) * 100)}% of sent` : undefined}
            />
            <StatCard
              value={results.failed}
              label="Failed"
              tone={results.failed > 0 ? "bad" : undefined}
              hint={results.failed > 0 ? "Credit is refunded after settling" : undefined}
            />
            <StatCard value={results.skipped} label="Not sent" hint="Consent, caps or quiet hours" />
            <StatCard
              value={results.redemptions}
              label="Redemptions"
              hint={results.sent > 0 ? `${(results.redemptionRate * 100).toFixed(1)}% of sent` : undefined}
            />
            <StatCard
              value={formatRand(totalCost)}
              label="Total cost"
              hint={costHint}
              tone={campaign.status !== "sent" ? undefined : "good"}
            />
          </StatGrid>
          <section className="builder-panel">
            <h2>Delivery per guest</h2>
            {rows.length === 0 ? (
              <EmptyState title="No messages yet." hint="Rows appear here once the campaign is confirmed and sending starts." />
            ) : (
              <DataTable
                caption={`Delivery status for ${campaign.name}`}
                rows={rows}
                columns={[
                  {
                    key: "guest",
                    header: "Guest",
                    cell: (row) => (
                      <>
                        {row.name}
                        <small>{CHANNEL_LABEL[row.channel]}</small>
                      </>
                    ),
                  },
                  { key: "status", header: "Status", cell: (row) => <Badge tone={row.status === "delivered" ? "sent" : row.status === "sent" ? "active" : undefined}>{messageStatusLabel(row.status)}</Badge> },
                  { key: "segments", header: "Segments", cell: (row) => (row.channel === "push" ? "Free" : row.segments) },
                  { key: "cost", header: "Cost", cell: (row) => (row.costCents > 0 ? formatRand(row.costCents) : "R0.00") },
                  {
                    key: "note",
                    header: "Note",
                    cell: (row) =>
                      row.errorCode ? (
                        <small>{row.errorCode}</small>
                      ) : row.attempts > 1 ? (
                        <small>Attempt {row.attempts}</small>
                      ) : (
                        ""
                      ),
                  },
                ]}
              />
            )}
          </section>
          <section className="builder-panel">
            <h2>Redemptions and visits</h2>
            <div className="outbox-meta">
              <span>Offer code</span>
              <span>{campaign.code}</span>
            </div>
            <div className="outbox-meta">
              <span>Redemptions</span>
              <span>
                {results.redemptions} ({(results.redemptionRate * 100).toFixed(1)}% of sent)
              </span>
            </div>
            <div className="outbox-meta">
              <span>Visits by recipients</span>
              <span>{results.attributableVisits}</span>
            </div>
            <p className="demo-data-note">{VISITS_LABEL}</p>
            {campaign.status !== "sent" && <PreviewBanner>The totals above change while the send is running. Cost is final once you settle.</PreviewBanner>}
          </section>
          {campaign.status === "sent" && (
            <p className="demo-data-note">
              This campaign is finished and stays as it was. To say something new, start a new campaign.
            </p>
          )}
        </>
      )}
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
