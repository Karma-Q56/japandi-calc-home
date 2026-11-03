import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { campaignBadge, Badge, ConfirmDialog, DataTable, EmptyState, PageHeader, PreviewBanner, StatCard, StatGrid } from "@/components/patron/dash";
import { campaignRecipients, campaignResults, messageStatusLabel, VISITS_LABEL } from "@/domain/campaigns";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import {
  approveCampaignFn,
  cancelCampaignFn,
  getCampaignResultsFn,
  getDataModeFn,
} from "@/server/live";
import { canApproveLiveCampaign, canCancelLiveCampaign } from "@/lib/live-actions";
import type { LiveCampaignResults } from "@/server/live-dashboard";
import {
  campaignTotals,
  messageStatusText,
  type CampaignMessageStatus,
} from "@/lib/live-campaigns";
import { maskLivePhone } from "@/lib/live-customers";
import { formatRand } from "@/lib/money";
import { useDemoState } from "@/data/useDemoState";

export const Route = createFileRoute("/app/campaigns/$campaignId")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async ({ params }) => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return {
      mode,
      live: await getCampaignResultsFn({ data: { campaignId: params.campaignId } }),
    };
  },
  component: ResultsPage,
});

const CHANNEL_LABEL: Record<"sms" | "push", string> = { sms: "SMS", push: "Push" };

function audienceLabel(audience: { type: string; days?: number; weekday?: number }): string {
  switch (audience.type) {
    case "everyone":
    case "all_opted_in":
      return "Everyone who opted in";
    case "new":
      return `Guests who joined in the last ${audience.days ?? "few"} days`;
    case "lapsed30":
    case "lapsed":
      return `Guests who have not visited in ${audience.days ?? 30} days`;
    case "close_to_reward":
      return "Guests one or two stamps from a reward";
    case "weekday":
      return "Guests who usually visit on the chosen day";
    case "birthday_month":
      return "Guests with a birthday this month";
    case "saved_list":
      return "A saved list";
    default:
      return "Everyone who opted in";
  }
}

function ResultsPage() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveCampaignResults data={data.live} />;
  return <DemoResultsPage />;
}

function DemoResultsPage() {
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
  const approveAndSend = () => {
    if (campaign.requiresApproval && !campaign.approvedBy) {
      const approved = api.campaign.approve({
        campaignId: campaign.id,
        actor: "owner",
        role: state.session.role,
      });
      if (!approved.ok) {
        setNotice(approved.error.message);
        return;
      }
    }
    const confirmed = api.campaign.confirm({
      campaignId: campaign.id,
      actor: "owner",
      sendNow: true,
    });
    setNotice(
      confirmed.ok
        ? "Approved and queued. In demo the dispatcher in the outbox delivers it; no real phone is messaged."
        : confirmed.error.message,
    );
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
          ) : campaign.status === "draft" ? (
            <>
              <ConfirmDialog
                label={canApprove ? "Approve and send" : "Send campaign"}
                question={
                  canApprove
                    ? `Approve this message and queue it for ${campaign.recipients || "the eligible"} guests? Nothing has been sent yet.`
                    : "Queue this message for the eligible guests? Nothing has been sent yet."
                }
                confirmLabel={canApprove ? "Yes, approve and send" : "Yes, send"}
                buttonClass="builder-primary"
                onConfirm={approveAndSend}
              />
              <a className="builder-secondary" href="/app/campaigns">
                Back to campaigns
              </a>
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
        <section className="builder-panel">
          <h2>Preview: what each guest gets</h2>
          <div className="cmp-phone">
            <small>
              From{" "}
              {state.restaurants.find((item) => item.id === campaign.restaurantId)?.name ??
                "your restaurant"}
            </small>
            <p>{campaign.body}</p>
            <small>Reply STOP to opt out</small>
          </div>
          <p className="demo-data-note">
            Audience: {audienceLabel(campaign.audience)}. Offer code {campaign.code}. Cost is
            calculated when you send and shown on the results page.
          </p>
          <PreviewBanner>
            Preview only. Nothing was sent. {canApprove
              ? "An operator wrote this; approve it before it can go out."
              : "Send it with the button above when you are happy."}
          </PreviewBanner>
        </section>
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

function LiveCampaignResults({ data }: { data: LiveCampaignResults | null }) {
  const [approved, setApproved] = useState(data?.campaign.approved ?? false);
  const [status, setStatus] = useState(data?.campaign.status ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) {
    return (
      <main className="demo-hub page-width">
        <EmptyState
          title="Campaign not found."
          hint="It may belong to another restaurant, or the link is out of date."
          action={
            <a className="builder-primary" href="/app/campaigns">
              Back to campaigns
            </a>
          }
        />
      </main>
    );
  }
  const totals = campaignTotals(
    data.messages.map((message) => message.status as CampaignMessageStatus),
  );
  const badge = campaignBadge(status as Parameters<typeof campaignBadge>[0]);
  const cost =
    status === "sent" ? data.campaign.actualCostCents : (data.campaign.estimatedCostCents ?? 0);
  const approve = async () => {
    setBusy(true);
    const result = await approveCampaignFn({ data: { campaignId: data.campaign.id } });
    setBusy(false);
    if (result.ok) {
      setApproved(true);
      setNotice("Campaign approved. Sending still waits for a later phase.");
    } else {
      setNotice(result.message);
    }
  };
  const cancel = async () => {
    setBusy(true);
    const result = await cancelCampaignFn({ data: { campaignId: data.campaign.id } });
    setBusy(false);
    if (result.ok) {
      setStatus("cancelled");
      setNotice("Campaign cancelled and the reservation released.");
    } else {
      setNotice(result.message);
    }
  };
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Campaign ${data.campaign.code}`}
        title={data.campaign.name}
        intro={data.campaign.body}
        actions={
          <>
            {canApproveLiveCampaign({
              status,
              requiresApproval: data.campaign.requiresApproval,
              approved,
            }) && (
              <button className="builder-primary" type="button" disabled={busy} onClick={approve}>
                Approve campaign
              </button>
            )}
            {canCancelLiveCampaign(status) && (
              <ConfirmDialog
                label="Cancel"
                question="Cancel this scheduled campaign and release its SMS reservation?"
                confirmLabel="Yes, cancel it"
                onConfirm={() => {
                  void cancel();
                }}
              />
            )}
            <a className="builder-secondary" href="/app/campaigns">
              Back to campaigns
            </a>
          </>
        }
      />
      <p className="eyebrow" aria-label="Campaign status">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </p>
      <StatGrid>
        <StatCard value={data.campaign.recipients} label="guests selected" />
        <StatCard value={totals.delivered} label="delivered" tone="good" />
        <StatCard value={totals.failed} label="failed" />
        <StatCard value={formatRand(cost)} label="cost" />
      </StatGrid>
      <section className="builder-panel">
        <h2>Recipients</h2>
        {data.messages.length === 0 ? (
          <p className="demo-data-note">
            No messages have been queued yet. This is a read-only live view.
          </p>
        ) : (
          <DataTable
            caption={`Recipients for ${data.campaign.name}`}
            rows={data.messages}
            columns={[
              {
                key: "guest",
                header: "Guest",
                cell: (message) => (
                  <>
                    {message.name}
                    <small>{maskLivePhone(message.phoneE164)}</small>
                  </>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (message) => (
                  <Badge tone={message.status === "delivered" ? "sent" : undefined}>
                    {messageStatusText(message.status as CampaignMessageStatus)}
                  </Badge>
                ),
              },
              {
                key: "segments",
                header: "Segments",
                cell: (message) => message.segments,
              },
              {
                key: "cost",
                header: "Cost",
                cell: (message) => formatRand(message.costCents),
              },
            ]}
          />
        )}
      </section>
      {notice && <p className="demo-data-note" role="status">{notice}</p>}
      <p className="demo-data-note">
        Sending, settling and editing campaign wording still come next.
      </p>
    </main>
  );
}
