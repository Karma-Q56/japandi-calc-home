import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { campaignResults } from "@/domain/campaigns";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/campaigns/$campaignId")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: ResultsPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function ResultsPage() {
  const { campaignId } = Route.useParams();
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [notice, setNotice] = useState("");
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    return (
      <main className="demo-hub page-width">
        <h1>Campaign not found.</h1>
        <p className="demo-intro">
          <a href="/app/campaigns">Back to campaigns →</a>
        </p>
      </main>
    );
  }
  const results = campaignResults(state, campaign.id);
  const canApprove =
    campaign.requiresApproval && !campaign.approvedBy && state.session.role !== "operator";
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
        ? `Settled at ${zar(settled.data.actualCostCents)} actual cost.`
        : settled.error.message,
    );
  };
  const cancel = () => {
    const cancelled = api.campaign.cancel({ campaignId: campaign.id, actor: "owner" });
    setNotice(cancelled.ok ? "Campaign cancelled; the reservation was released." : cancelled.error.message);
  };
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Campaign · {campaign.status}
      </p>
      <h1>{campaign.name}</h1>
      <p className="demo-intro">
        Code {campaign.code} · {campaign.body}
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
      {results && (
        <section className="guest-panel">
          <h2>Results</h2>
          <div className="outbox-meta">
            <span>Queued</span>
            <span>{results.queued}</span>
          </div>
          <div className="outbox-meta">
            <span>Sent</span>
            <span>{results.sent}</span>
          </div>
          <div className="outbox-meta">
            <span>Delivered</span>
            <span>{results.delivered}</span>
          </div>
          <div className="outbox-meta">
            <span>Failed</span>
            <span>{results.failed}</span>
          </div>
          <div className="outbox-meta">
            <span>Skipped</span>
            <span>{results.skipped}</span>
          </div>
          <div className="outbox-meta">
            <span>Redemptions</span>
            <span>
              {results.redemptions} ({(results.redemptionRate * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="outbox-meta">
            <span>Cost</span>
            <span>{zar(results.costCents)}</span>
          </div>
          <div className="outbox-meta">
            <span>Attributable visits</span>
            <span>{results.attributableVisits}</span>
          </div>
          <p className="demo-data-note">{results.visitsLabel}</p>
        </section>
      )}
      {(campaign.status === "sending" || campaign.status === "scheduled") && (
        <section className="guest-panel">
          <h2>Finish up</h2>
          <button className="builder-primary" onClick={settle}>
            Settle campaign
          </button>{" "}
          <button className="guest-back" onClick={cancel}>
            Cancel
          </button>
        </section>
      )}
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
      <p className="demo-data-note">
        <a href="/app/campaigns">Back to campaigns →</a>
      </p>
    </main>
  );
}
