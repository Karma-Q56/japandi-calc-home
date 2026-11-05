import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import { useState } from "react";
import { dailySeries } from "@/lib/home-metrics";

import type { CampaignAudience } from "@/data/types";

const RANGE_OPTIONS = [7, 30, 90] as const;
type InsightsRange = (typeof RANGE_OPTIONS)[number];
const DAY_MS = 86400000;

export const Route = createFileRoute("/app/insights")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: InsightsPage,
});

/** One tap opens the composer with that group already chosen. */
function audienceFor(key: string, weekday: number): CampaignAudience | null {
  switch (key) {
    case "day":
      return { type: "weekday", weekday };
    case "items":
      return { type: "everyone" };
    case "slipping":
      return { type: "lapsed30", days: 30 };
    case "birthdays":
      return { type: "birthday_month" };
    case "new":
      return { type: "new", days: 14 };
    default:
      return null;
  }
}

function InsightsPage() {
  const state = useDemoState();
  const navigate = useNavigate();
  const [range, setRange] = useState<InsightsRange>(30);
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const result = api.insights.owner({
    restaurantId: restaurant.id,
    session: { role: state.session.role, restaurantId: state.session.restaurantId },
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow={`Insights · ${restaurant.name}`}
          title="We could not build your insights."
          intro={result.error.message}
        />
        <p>
          <a href="/app">Back to the dashboard</a>
        </p>
      </main>
    );
  }
  const data = result.data;

  const message = (audience: CampaignAudience | null) => {
    if (!audience) return;
    const search: Record<string, string> = {};
    if (audience.type === "weekday") search["segment"] = "weekday";
    if (audience.type === "weekday") search["weekday"] = String(audience.weekday);
    if (audience.type === "birthday_month") search["segment"] = "birthday_month";
    void navigate({
      to: "/app/campaigns/new",
      search: search as never,
    });
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Insights · ${restaurant.name}`}
        title="What your guests are telling you."
        intro="Every block comes from your own stamps, orders and join list. One tap opens the message window with that group already chosen."
      />
      <div role="group" aria-label="Date range" className="home-pills">
        {RANGE_OPTIONS.map((days) => (
          <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days)}>
            Last {days} days
          </button>
        ))}
      </div>
      <InsightsCharts restaurantId={restaurant.id} range={range} />
      <div className="insights-grid">
        <section className="builder-panel">
          <h2>Busiest days</h2>
          <BlockList
            items={data.busiestDays.map((block) => ({
              key: `day-${block.weekday}`,
              name: `${plural(block.visits, "visit")} on ${pluralDay(block.weekday)}`,
              audience: audienceFor("day", block.weekday),
            }))}
            onMessage={message}
            empty="Not enough visits yet to spot a pattern."
          />
        </section>
        <section className="builder-panel">
          <h2>Busiest times</h2>
          <BlockList
            items={data.busiestTimes.map((block) => ({
              key: `time-${block.bucket}`,
              name: `${plural(block.visits, "visit")} ${block.label}`,
              audience: audienceFor("day", data.busiestDays[0]?.weekday ?? 0),
            }))}
            onMessage={message}
            empty="No stamped visits yet."
          />
        </section>
        <section className="builder-panel">
          <h2>Quiet days</h2>
          <BlockList
            items={data.quietDays.map((block) => ({
              key: `quiet-${block.weekday}`,
              name: `${plural(block.visits, "visit")} on ${pluralDay(block.weekday)}`,
              audience: audienceFor("day", block.weekday),
            }))}
            onMessage={message}
            empty="Not enough visits yet to spot a pattern."
          />
        </section>
        <section className="builder-panel">
          <h2>What guests order</h2>
          <BlockList
            items={data.topItems.map((entry) => ({
              key: `item-${entry.label}`,
              name: `${entry.label} · ${plural(entry.qty, "ordered")}`,
              audience: audienceFor("items", 0),
            }))}
            onMessage={message}
            empty={
              restaurant.trackOrders
                ? "No orders saved yet."
                : "Turn on tracking orders in settings to see this."
            }
          />
        </section>
        <section className="builder-panel">
          <h2>Regulars who are slipping</h2>
          <BlockList
            count={data.slippingRegulars.length}
            items={data.slippingRegulars.map((row) => ({
              key: row.membershipId,
              name: `${row.name} · ${row.detail}`,
              audience: audienceFor("slipping", 0),
            }))}
            onMessage={message}
            empty="Nobody has gone quiet right now."
          />
        </section>
        <section className="builder-panel">
          <h2>Birthdays coming up</h2>
          <BlockList
            count={data.birthdaysUpcoming.length}
            items={data.birthdaysUpcoming.map((row) => ({
              key: row.membershipId,
              name:
                row.inDays === 0
                  ? `${row.name} · today, ${row.when}`
                  : `${row.name} · ${row.when}, in ${row.inDays} ${row.inDays === 1 ? "day" : "days"}`,
              audience: audienceFor("birthdays", 0),
            }))}
            onMessage={message}
            empty="No birthdays in the next few weeks."
          />
        </section>
        <section className="builder-panel">
          <h2>New guests this week</h2>
          <BlockList
            count={data.newGuests.length}
            items={data.newGuests.map((row) => ({
              key: row.membershipId,
              name: `${row.name} · ${row.detail}`,
              audience: audienceFor("new", 0),
            }))}
            onMessage={message}
            empty="No new guests joined this week."
          />
        </section>
      </div>
      <p>
        <a href="/app">Back to the dashboard</a>
      </p>
    </main>
  );
}

function InsightsCharts({ restaurantId, range }: { restaurantId: string; range: InsightsRange }) {
  const state = useDemoState();
  const now = state.now;
  const cutoff = now - range * DAY_MS;
  const stamps = state.stamps.filter((s) => s.restaurantId === restaurantId && s.status === "valid");
  const memberships = state.memberships.filter((m) => m.restaurantId === restaurantId);
  const series = dailySeries(stamps, memberships, now, range);
  const maxVisits = Math.max(1, ...series.map((p) => p.visits));
  const totalVisits = series.reduce((sum, p) => sum + p.visits, 0);

  // Visits per guest in the window: one visit is new, two or more is returning.
  const visitsByGuest = new Map<string, number>();
  for (const stamp of stamps) {
    if (new Date(stamp.createdAt).getTime() < cutoff) continue;
    visitsByGuest.set(stamp.membershipId, (visitsByGuest.get(stamp.membershipId) ?? 0) + 1);
  }
  let newGuests = 0;
  let returning = 0;
  for (const count of visitsByGuest.values()) {
    if (count === 1) newGuests += 1;
    else returning += 1;
  }
  const guestTotal = newGuests + returning;
  const returningShare = guestTotal === 0 ? null : Math.round((returning / guestTotal) * 100);

  // Reward funnel: everyone who joined, then first stamp, halfway, and claimed.
  const joined = memberships.length;
  const firstStamp = memberships.filter((m) => m.stampsTotal >= 1).length;
  const halfway = memberships.filter((m) => m.stampsTotal >= 5).length;
  const claimed = state.rewards.filter(
    (r) => r.restaurantId === restaurantId && r.redeemedAt,
  ).length;
  const funnel = [
    { label: "Joined", value: joined },
    { label: "First stamp", value: firstStamp },
    { label: "Halfway to a reward", value: halfway },
    { label: "Reward claimed", value: claimed },
  ];

  return (
    <div className="insights-grid">
      <section className="builder-panel">
        <h2>Visits over time</h2>
        <p className="demo-data-note">
          {totalVisits} visits in the last {range} days, one bar per day.
        </p>
        {totalVisits === 0 ? (
          <EmptyState title="No visits in this range" hint="Try a longer range, or wait for the next stamp." />
        ) : (
          <div className="week-chart" role="img" aria-label="Visits per day">
            {series.map((p) => (
              <span key={p.day} title={`${p.visits} visits`}>
                <i style={{ height: `${Math.round((p.visits / maxVisits) * 100)}%` }} />
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="builder-panel">
        <h2>New vs returning</h2>
        {guestTotal === 0 ? (
          <EmptyState title="No guests in this range" hint="New and returning guests appear once they stamp." />
        ) : (
          <>
            <p className="demo-data-note">
              {returningShare}% of guests came back at least once in this range.
            </p>
            <ul className="insights-list">
              <li>
                <span>New guests (one visit)</span>
                <b>{newGuests}</b>
              </li>
              <li>
                <span>Returning guests (two or more)</span>
                <b>{returning}</b>
              </li>
            </ul>
          </>
        )}
      </section>
      <section className="builder-panel">
        <h2>Reward funnel</h2>
        {joined === 0 ? (
          <EmptyState title="No members yet" hint="The funnel fills in as guests join and stamp." />
        ) : (
          <>
            <p className="demo-data-note">How far guests get, from joining to claiming a reward.</p>
            <ul className="insights-list">
              {funnel.map((step) => (
                <li key={step.label}>
                  <span>{step.label}</span>
                  <b>
                    {step.value} ({Math.round((step.value / joined) * 100)}%)
                  </b>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function plural(n: number, word: string) {
  if (word === "visit") return `${n} ${n === 1 ? "visit" : "visits"}`;
  return `${n} ${word}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function pluralDay(weekday: number) {
  return DAY_NAMES[weekday] ?? "that day";
}

function BlockList({
  items,
  empty,
  onMessage,
  count,
}: {
  items: Array<{ key: string; name: string; audience: CampaignAudience | null }>;
  empty: string;
  onMessage: (audience: CampaignAudience | null) => void;
  count?: number;
}) {
  if (items.length === 0) {
    return <EmptyState title={empty} />;
  }
  return (
    <ul className="insights-list">
      {items.map((item) => (
        <li key={item.key}>
          <span>{item.name}</span>
          <button className="builder-secondary" onClick={() => onMessage(item.audience)}>
            Message them
          </button>
        </li>
      ))}
      {typeof count === "number" && count > items.length && (
        <li className="insights-more">and {count - items.length} more</li>
      )}
    </ul>
  );
}
