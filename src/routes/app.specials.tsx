import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { Campaign, Offer } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import {
  Badge,
  campaignBadge,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
} from "@/components/patron/dash";
import { Tabs } from "@/components/patron/kit";
import { getDataModeFn } from "@/server/live";
import { getSpecialsFn } from "@/server/live-specials-fns";
import { LiveSpecialsTab } from "@/components/patron/live/LiveSpecialsTab";

export const Route = createFileRoute("/app/specials")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getSpecialsFn() };
  },
  component: OffersPage,
});

type Tab = "offers" | "messages" | "credit" | "specials";

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const day = (iso: string | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeZone: "Africa/Johannesburg",
      }).format(new Date(iso))
    : "Always on";

const PLACEMENTS: Array<{ key: keyof Offer["placements"]; label: string }> = [
  { key: "page", label: "On your page" },
  { key: "till", label: "At the till" },
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
];

function placementLabel(offer: Offer): string {
  const on = PLACEMENTS.filter((placement) => offer.placements[placement.key]).map(
    (placement) => placement.label,
  );
  return on.length > 0 ? on.join(" · ") : "Not placed anywhere yet";
}

function offerStatus(offer: Offer, campaign: Campaign | undefined) {
  if (campaign) return campaignBadge(campaign.status);
  if (offer.status === "sent") return { label: "Sent", tone: "sent" as const };
  if (offer.status === "scheduled") return { label: "Scheduled", tone: "active" as const };
  if (offer.status === "cancelled") return { label: "Cancelled" };
  return { label: "Live", tone: "active" as const };
}

type OfferRow = { offer: Offer; campaign: Campaign | undefined; history: boolean };

function OffersPage() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("offers");
  if (data.mode === "live") return <LiveSpecialsPage specials={data.live} tab={tab} setTab={setTab} />;
  return <DemoOffersPage tab={tab} setTab={setTab} />;
}

function LiveSpecialsPage({
  specials,
  tab,
  setTab,
}: {
  specials: Awaited<ReturnType<typeof getSpecialsFn>>;
  tab: Tab;
  setTab: (tab: Tab) => void;
}) {
  const count = specials?.length ?? 0;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Campaigns"
        title="Specials"
        intro="A special is a deal a guest can use at the till. Public and members-only specials have one code. Targeted ones give each guest their own code."
      />
      <Tabs
        label="Campaign sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: "offers", label: "Campaigns" },
          { value: "specials", label: `Specials (${count})` },
        ]}
      />
      {tab === "specials" ? (
        <LiveSpecialsTab specials={specials} />
      ) : (
        <p role="status" className="demo-data-note">
          Live campaigns are not ready yet. Specials are live now.
        </p>
      )}
    </main>
  );
}

function DemoOffersPage({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const campaignById = new Map(state.campaigns.map((campaign) => [campaign.id, campaign]));

  const offers: OfferRow[] = state.offers
    .filter((offer) => offer.restaurantId === restaurant.id)
    .map((offer) => ({
      offer,
      campaign: offer.legacyCampaignId ? campaignById.get(offer.legacyCampaignId) : undefined,
      // Migrated specials and past campaigns stay readable, never editable.
      history: Boolean(offer.legacySpecialId) || Boolean(offer.legacyCampaignId),
    }))
    .sort((a, b) => (b.offer.createdAt ?? "").localeCompare(a.offer.createdAt ?? ""));

  const campaigns = state.campaigns
    .filter((campaign) => campaign.restaurantId === restaurant.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sent = campaigns.filter(
    (campaign) => campaign.status === "sent" || campaign.status === "sending",
  );
  const credit = api.credit.list(restaurant.id);
  const ledger = credit.ok ? credit.data : null;

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Campaigns · ${restaurant.name}`}
        title="Your campaigns"
        intro="Write the campaign, choose who hears about it, then send. Push is free, SMS comes out of your credit."
        actions={
          <a className="builder-primary" href="/app/campaigns/new">
            New campaign
          </a>
        }
      />
      <Tabs
        label="Campaign sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: "offers", label: `Campaigns (${offers.length})` },
          { value: "messages", label: `Messages sent (${sent.length})` },
          { value: "credit", label: "Credit" },
        ]}
      />

      {tab === "offers" &&
        (offers.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            hint="A campaign is an offer plus a message. Write the first one and pick who should hear about it."
            action={
              <a className="builder-primary" href="/app/campaigns/new">
                Write a campaign
              </a>
            }
          />
        ) : (
          <DataTable
            caption={`Campaigns for ${restaurant.name}`}
            rows={offers}
            columns={[
              {
                key: "offer",
                header: "Campaign",
                cell: ({ offer, history }) => (
                  <>
                    <strong>{offer.title}</strong>
                    <small>
                      {offer.code ? `Code ${offer.code}` : "No code"} · {placementLabel(offer)}
                      {history ? " · History" : ""}
                    </small>
                  </>
                ),
              },
              {
                key: "when",
                header: "When",
                cell: ({ offer }) =>
                  offer.startsAt || offer.endsAt
                    ? `${day(offer.startsAt)} to ${day(offer.endsAt)}`
                    : "Always on",
              },
              {
                key: "status",
                header: "Status",
                cell: ({ offer, campaign }) => {
                  const status = offerStatus(offer, campaign);
                  return (
                    <Badge {...(status.tone ? { tone: status.tone } : {})}>{status.label}</Badge>
                  );
                },
              },
              {
                key: "reach",
                header: "Guests reached",
                cell: ({ campaign }) => (campaign ? campaign.recipients : 0),
              },
              {
                key: "open",
                header: "",
                cell: ({ campaign }) =>
                  campaign && campaign.status !== "draft" ? (
                    <a href={`/app/campaigns/${campaign.id}`}>Results</a>
                  ) : (
                    <span className="gx-note">Saved as history</span>
                  ),
              },
            ]}
          />
        ))}

      {tab === "messages" &&
        (campaigns.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            hint="Once you send an offer, every message and its cost shows here."
          />
        ) : (
          <DataTable
            caption="Messages sent"
            rows={campaigns}
            columns={[
              {
                key: "campaign",
                header: "Campaign",
                cell: (campaign) => (
                  <>
                    <strong>{campaign.name}</strong>
                    <small>
                      {campaign.code} ·{" "}
                      {campaign.channel === "sms"
                        ? "SMS"
                        : campaign.channel === "push"
                          ? "Push"
                          : "Push then SMS"}
                    </small>
                  </>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (campaign) => {
                  const status = campaignBadge(campaign.status);
                  return (
                    <Badge {...(status.tone ? { tone: status.tone } : {})}>{status.label}</Badge>
                  );
                },
              },
              {
                key: "recipients",
                header: "Guests",
                cell: (campaign) => campaign.recipients,
              },
              {
                key: "cost",
                header: "Cost",
                cell: (campaign) => zar(campaign.actualCostCents || campaign.estCostCents || 0),
              },
              {
                key: "sent",
                header: "When",
                cell: (campaign) =>
                  day(campaign.sentAt ?? campaign.scheduledAt ?? campaign.createdAt),
              },
              {
                key: "open",
                header: "",
                cell: (campaign) =>
                  campaign.status === "draft" ? (
                    <a href="/app/campaigns/new">Continue draft</a>
                  ) : (
                    <a href={`/app/campaigns/${campaign.id}`}>Results</a>
                  ),
              },
            ]}
          />
        ))}

      {tab === "credit" && (
        <>
          <StatGrid dense>
            <StatCard value={zar(ledger?.balanceCents ?? 0)} label="Credit available" />
            <StatCard value={sent.length} label="Campaigns sent" />
            <StatCard
              value={zar(sent.reduce((sum, c) => sum + (c.actualCostCents || 0), 0))}
              label="Spent so far"
            />
          </StatGrid>
          <p className="cmp-note">
            One SMS segment costs R0.35. Push is free. Top up and see every charge on the credit
            page.
          </p>
          <a className="builder-secondary" href="/app/credit">
            Open credit
          </a>
        </>
      )}
    </main>
  );
}
