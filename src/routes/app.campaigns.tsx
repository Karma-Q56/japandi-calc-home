import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/campaigns")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: CampaignsPage,
});

function CampaignsPage() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const restaurantId = state.session.restaurantId;
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>Campaigns.</h1>
        <p className="demo-intro">Open this page from a restaurant tunnel.</p>
      </main>
    );
  }
  const result = api.campaign.list(restaurant.id);
  const campaigns = result.ok ? result.data : [];
  const needsApproval = campaigns.filter((c) => c.requiresApproval && !c.approvedBy);
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · Campaigns
      </p>
      <h1>Message your regulars.</h1>
      <p className="demo-intro">
        <a className="builder-primary" href="/app/campaigns/new">
          New campaign
        </a>
      </p>
      {needsApproval.length > 0 && (
        <section className="guest-panel">
          <h2>Needs your approval</h2>
          {needsApproval.map((campaign) => (
            <div className="outbox-meta" key={campaign.id}>
              <span>
                <strong>{campaign.name}</strong> · drafted by {campaign.createdBy}
              </span>
              <a href={`/app/campaigns/${campaign.id}`}>Review →</a>
            </div>
          ))}
        </section>
      )}
      <section className="guest-panel">
        <h2>All campaigns</h2>
        {campaigns.length === 0 && <p className="demo-data-note">No campaigns yet.</p>}
        {campaigns.map((campaign) => (
          <div className="outbox-meta" key={campaign.id}>
            <span>
              <strong>{campaign.name}</strong> · code {campaign.code}
            </span>
            <span>
              <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>{" "}
              <a href={`/app/campaigns/${campaign.id}`}>Open →</a>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
