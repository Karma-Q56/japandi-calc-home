import { SectionTabs } from "@/components/patron/kit/SectionTabs";
import { composerHref, type AudienceType } from "@/lib/live-campaigns";
import { useNavigate } from "@tanstack/react-router";
import { DataTable, EmptyState, Helper, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { TrendChart } from "@/components/patron/TrendChart";
import { INSIGHT_RANGES, type InsightRange } from "@/lib/live-insights";
import type { InsightsResult } from "@/server/live-insights";

type Tab = "guests" | "performance";

const RANGE_LABEL: Record<InsightRange, string> = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };

/** Live Insights page. Shows real counts for the signed-in restaurant only. */
export function LiveInsights({
  restaurantName,
  result,
  range,
  tab,
  onRange,
  onTab,
  csvHref,
}: {
  restaurantName: string;
  result: InsightsResult | null;
  range: InsightRange;
  tab: Tab;
  onRange: (range: InsightRange) => void;
  onTab: (tab: Tab) => void;
  csvHref: string;
}) {
  const navigate = useNavigate();

  if (!result) {
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

  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow={restaurantName} title="We could not load your insights." intro={result.message} />
      </main>
    );
  }

  const { guests, performance } = result;
  const campaignHref = (segment: AudienceType) => composerHref({ segment });

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={restaurantName}
        title="Insights."
        intro="Real numbers from your visits and guests. Counts and dates only, no guest details in this view or the download."
        actions={
          <a className="pk-button pk-button--secondary" href={csvHref} download>
            Download CSV
          </a>
        }
      />
      <div className="pk-filter-row" role="group" aria-label="Date range">
        {INSIGHT_RANGES.map((value) => (
          <button
            key={value}
            type="button"
            className={`pk-filter${range === value ? " is-active" : ""}`}
            aria-pressed={range === value}
            onClick={() => onRange(value)}
          >
            {RANGE_LABEL[value]}
          </button>
        ))}
      </div>
      <SectionTabs
        tabs={[
          { id: "guests", label: "Guests" },
          { id: "performance", label: "Performance" },
        ]}
        active={tab}
        onSelect={onTab}
        label="Insights sections"
        className="section-tabs--inline"
      />

      {tab === "guests" ? (
        <section aria-label="Guests">
          <StatGrid>
            <StatCard value={guests.newGuests} label="New guests" hint={guests.newGuestsChange} />
            <StatCard value={guests.returningGuests} label="Guests who came back" />
            <StatCard value={guests.lapsedGuests} label={`Not seen in ${guests.lapsedDays} days`} />
          </StatGrid>
          {guests.dailyNew.length > 0 ? (
            <TrendChart
              label="New guests per day"
              points={guests.dailyNew.map((row) => ({ label: row.day, value: row.count }))}
            />
          ) : (
            <EmptyState title="No new guests in this range." hint="Try a longer range." />
          )}
          <p>
            <Helper>Send a message to guests who have not come back lately.</Helper>{" "}
            <button type="button" className="pk-button" onClick={() => navigate({ to: campaignHref("lapsed30") })}>
              Message lapsed guests
            </button>
          </p>
        </section>
      ) : (
        <section aria-label="Performance">
          <StatGrid>
            <StatCard value={performance.visits} label="Visits" hint={performance.visitsChange} />
            <StatCard value={performance.uniqueGuests} label="Guests who visited" />
            <StatCard value={performance.rewardsEarned} label="Rewards earned" />
          </StatGrid>
          {performance.dailyVisits.length > 0 ? (
            <TrendChart
              label="Visits per day"
              points={performance.dailyVisits.map((row) => ({ label: row.day, value: row.count }))}
            />
          ) : (
            <EmptyState title="No visits in this range." hint="Visits show here once guests stamp their cards." />
          )}
          {performance.tillOrdersEnabled ? (
            performance.topItems.length > 0 ? (
              <DataTable
                caption="Top items"
                columns={[
                  { key: "name", header: "Item", cell: (item) => item.name },
                  { key: "quantity", header: "Sold", cell: (item) => item.quantity },
                ]}
                rows={performance.topItems}
              />
            ) : (
              <EmptyState title="No item sales in this range." />
            )
          ) : (
            <Helper>Item sales appear here when orders at the till are on.</Helper>
          )}
        </section>
      )}
    </main>
  );
}
