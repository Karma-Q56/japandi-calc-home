import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/api";
import {
  campaignBadge,
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
} from "@/components/patron/dash";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { getCampaignListFn, getDataModeFn } from "@/server/live";
import type { LiveCampaignList } from "@/server/live-dashboard";
import { formatRand } from "@/lib/money";
import { withChildren } from "@/lib/nested";
import { useDemoState } from "@/data/useDemoState";

const CampaignsWithChildren = withChildren(CampaignsPage);

export const Route = createFileRoute("/app/campaigns")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getCampaignListFn() };
  },
  component: CampaignsWithChildren,
});

function CampaignsPage() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveCampaigns data={data.live} />;
  return <DemoCampaignsPage />;
}

function LiveCampaigns({ data }: { data: LiveCampaignList | null }) {
  if (!data) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Live mode"
          title="This login is not linked to a restaurant."
          intro="Ask Patron to link your owner account to a restaurant, then sign in again."
        />
      </main>
    );
  }
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={data.restaurantName}
        title="Your campaigns."
        intro="Read from your live campaign history. The composer and results page come next."
      />
      <section className="builder-panel">
        <h2>All campaigns</h2>
        {data.campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet."
            hint="The live composer arrives with the next build. Your sent campaigns will appear here."
          />
        ) : (
          <DataTable
            caption={`Campaigns for ${data.restaurantName}`}
            rows={data.campaigns}
            columns={[
              {
                key: "name",
                header: "Campaign",
                cell: (campaign) => (
                  <>
                    {campaign.name}
                    <small>Code {campaign.code}</small>
                  </>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (campaign) => {
                  const badge = campaignBadge(
                    campaign.status as Parameters<typeof campaignBadge>[0],
                  );
                  return <Badge tone={badge.tone}>{badge.label}</Badge>;
                },
              },
              {
                key: "recipients",
                header: "Guests",
                cell: (campaign) => (campaign.status === "draft" ? "" : campaign.recipients),
              },
              {
                key: "cost",
                header: "Cost",
                cell: (campaign) => {
                  const cents =
                    campaign.status === "sent"
                      ? campaign.actualCostCents
                      : (campaign.estimatedCostCents ?? 0);
                  return cents > 0 ? formatRand(cents) : "R0.00";
                },
              },
              {
                key: "open",
                header: "",
                cell: (campaign) => (
                  <a href={`/app/campaigns/${campaign.id}`}>Open →</a>
                ),
              },
            ]}
          />
        )}
      </section>
    </main>
  );
}

function DemoCampaignsPage() {
  const state = useDemoState();
  const restaurantId = state.session.restaurantId;
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>Campaigns.</h1>
        <p className="demo-intro">Choose a venue first, then open this page again.</p>
      </main>
    );
  }
  const result = api.campaign.list(restaurant.id);
  const campaigns = result.ok ? result.data : [];
  const needsApproval = campaigns.filter((c) => c.requiresApproval && !c.approvedBy);
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={restaurant.name}
        title="Message your regulars."
        actions={
          <a className="builder-primary" href="/app/campaigns/new">
            New campaign
          </a>
        }
      />
      {needsApproval.length > 0 && (
        <section className="guest-panel">
          <h2>Needs your approval</h2>
          <p className="demo-data-note">
            An operator drafted these. Nothing sends until you approve.
          </p>
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
      <section className="builder-panel">
        <h2>All campaigns</h2>
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet."
            hint="Write your first message to bring guests back. You pick who gets it and see the cost before anything sends."
            action={
              <a className="builder-primary" href="/app/campaigns/new">
                New campaign
              </a>
            }
          />
        ) : (
          <DataTable
            caption={`Campaigns for ${restaurant.name}`}
            rows={campaigns}
            columns={[
              {
                key: "name",
                header: "Campaign",
                cell: (campaign) => (
                  <>
                    {campaign.name}
                    <small>Code {campaign.code}</small>
                  </>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (campaign) => {
                  const badge = campaignBadge(campaign.status);
                  return <Badge tone={badge.tone}>{badge.label}</Badge>;
                },
              },
              {
                key: "recipients",
                header: "Guests",
                cell: (campaign) => (campaign.status === "draft" ? "" : campaign.recipients),
              },
              {
                key: "cost",
                header: "Cost",
                cell: (campaign) => {
                  const cents =
                    campaign.status === "sent"
                      ? campaign.actualCostCents
                      : (campaign.estCostCents ?? 0);
                  return cents > 0 ? formatRand(cents) : "R0.00";
                },
              },
              {
                key: "open",
                header: "",
                cell: (campaign) => <a href={`/app/campaigns/${campaign.id}`}>Open →</a>,
              },
            ]}
          />
        )}
      </section>
    </main>
  );
}
