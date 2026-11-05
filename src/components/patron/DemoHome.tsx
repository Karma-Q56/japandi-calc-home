import { useState } from "react";
import { useDemoState } from "@/data/useDemoState";
import { TrendChart } from "@/components/patron/TrendChart";
import { PageHeader, StatCard, StatGrid, EmptyState } from "@/components/patron/dash";
import {
  attentionItems,
  bestRegulars,
  busiestHours,
  dailySeries,
  metricValue,
  peakHour,
  percentChange,
  sumMetric,
  type HomeMetric,
  type HomeRange,
} from "@/lib/home-metrics";

const METRICS: { key: HomeMetric; label: string }[] = [
  { key: "visits", label: "Visits" },
  { key: "sales", label: "Estimated sales" },
  { key: "unique", label: "Unique guests" },
  { key: "new", label: "New members" },
];

const RANGES: HomeRange[] = [7, 14, 30];
const DAY = 86400000;
const TZ = "Africa/Johannesburg";

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(
    new Date(iso),
  );
const rand = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

export function DemoHome({ restaurantId }: { restaurantId: string }) {
  const state = useDemoState();
  const [metric, setMetric] = useState<HomeMetric>("visits");
  const [range, setRange] = useState<HomeRange>(7);
  const now = state.now;
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) return null;

  const stamps = state.stamps.filter((s) => s.restaurantId === restaurantId);
  const memberships = state.memberships.filter((m) => m.restaurantId === restaurantId);
  const customers = new Map(state.customers.map((c) => [c.id, c]));
  const nameOf = (membershipId: string) => {
    const m = memberships.find((item) => item.id === membershipId);
    const c = m ? customers.get(m.customerId) : undefined;
    if (!c) return "A guest";
    const [first = "", ...rest] = c.name.trim().split(/\s+/);
    const last = rest[rest.length - 1];
    return last ? `${first} ${last[0]}.` : first;
  };

  const series = dailySeries(stamps, memberships, now, range);
  const twoDays = dailySeries(stamps, memberships, now, 2);
  const today = twoDays[1]!;
  const yesterday = twoDays[0]!;
  const total = sumMetric(series, metric);
  const max = Math.max(1, ...series.map((p) => metricValue(p, metric)));
  const hours = busiestHours(stamps, now);
  const peak = peakHour(hours);
  const regulars = bestRegulars(stamps, memberships, now);
  const lapsed = memberships.filter(
    (m) => m.lastVisitAt && now - new Date(m.lastVisitAt).getTime() > 30 * DAY,
  ).length;
  const rewardsWaiting = state.rewards.filter(
    (r) => r.restaurantId === restaurantId && !r.redeemedAt,
  ).length;
  const drafts = state.campaigns.filter(
    (c) => c.restaurantId === restaurantId && c.status === "draft",
  ).length;
  const attention = attentionItems({
    rewardsWaiting,
    lapsedGuests: lapsed,
    lowCreditCents: restaurant.creditCents,
    unpublishedDrafts: drafts,
  });
  const todayStamps = stamps
    .filter((s) => s.status === "valid" && now - new Date(s.createdAt).getTime() < DAY)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const change = (current: number, previous: number) => {
    const pct = percentChange(current, previous);
    return pct === null ? "No visits yesterday" : `${pct >= 0 ? "+" : ""}${pct}% vs yesterday`;
  };
  const totalDisplay = metric === "sales" ? rand(total) : total.toLocaleString("en-ZA");

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Overview"
        title="Welcome back."
        intro={`Here is how ${restaurant.name} is doing today.`}
        actions={
          <>
            <a className="builder-primary" href="/stamp">
              Open the till
            </a>
          </>
        }
      />
      <StatGrid>
        <StatCard
          value={today.visits}
          label="Visits today"
          hint={change(today.visits, yesterday.visits)}
          href="/stamp"
        />
        <StatCard
          value={today.unique}
          label="Guests today"
          hint={change(today.unique, yesterday.unique)}
          href="/app/customers"
        />
        <StatCard
          value={today.newMembers}
          label="New members today"
          hint={change(today.newMembers, yesterday.newMembers)}
          href="/app/customers"
        />
        <StatCard
          value={rewardsWaiting}
          label="Rewards waiting"
          hint="Earned and not yet redeemed."
          href="/app/customers"
        />
      </StatGrid>

      <section className="builder-panel">
        <div className="home-chart-head">
          <h2>Trading</h2>
          <div role="group" aria-label="Range" className="home-pills">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                {r} days
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-label="Metric" className="home-pills">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="demo-data-note">
          {METRICS.find((m) => m.key === metric)!.label}: {totalDisplay} over the last {range} days.
          {metric === "sales" ? " Estimated from visits at an average spend, not till totals." : ""}
        </p>
        {total === 0 ? (
          <EmptyState
            title="No activity yet"
            hint="Stamps and new members will show here once guests start visiting."
          />
        ) : (
          <TrendChart
            label={`${METRICS.find((m) => m.key === metric)!.label} by day`}
            format={metric === "sales" ? rand : undefined}
            points={series.map((p) => ({
              label: new Intl.DateTimeFormat("en-ZA", {
                day: "numeric",
                month: "short",
                timeZone: TZ,
              }).format(new Date(p.day)),
              value: metricValue(p, metric),
            }))}
          />
        )}
      </section>

      <section className="builder-panel">
        <h2>Today so far</h2>
        {todayStamps.length === 0 ? (
          <p className="demo-data-note">No stamps yet today.</p>
        ) : (
          <ul className="home-feed">
            {todayStamps.map((s) => (
              <li key={s.id}>
                <span>{nameOf(s.membershipId)} stamped</span>
                <small>{clock(s.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="builder-panel">
        <h2>Busiest hours</h2>
        {peak ? (
          <>
            <p className="demo-data-note">
              Busiest around {hourLabel(peak.hour)}, with {peak.visits} visits in the last 14 days.
            </p>
            <div className="week-chart" role="img" aria-label="Visits by hour">
              {hours.map((h) => (
                <span key={h.hour} title={`${hourLabel(h.hour)}: ${h.visits}`}>
                  <i
                    className={h.hour === peak.hour ? "home-peak" : undefined}
                    style={{ height: `${Math.round((h.visits / peak.visits) * 100)}%` }}
                  />
                </span>
              ))}
            </div>
            <div className="hour-labels" aria-hidden="true">
              {hours.map((h) => (
                <span key={h.hour}>{h.hour % 2 === 0 ? String(h.hour).padStart(2, "0") : ""}</span>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No visits in the last 14 days"
            hint="Busy hours appear once guests start stamping."
          />
        )}
      </section>

      <section className="builder-panel">
        <h2>Your best regulars</h2>
        {regulars.length === 0 ? (
          <p className="demo-data-note">
            Guests with two or more visits in 30 days will appear here.
          </p>
        ) : (
          <ul className="home-feed">
            {regulars.map((r) => (
              <li key={r.membershipId}>
                <span>{nameOf(r.membershipId)}</span>
                <small>{r.visits} visits</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="builder-panel">
        <h2>Needs attention</h2>
        {attention.length === 0 ? (
          <p className="demo-data-note">Nothing needs you right now.</p>
        ) : (
          <ul className="home-feed">
            {attention.map((item) => (
              <li key={item.key}>
                <a href={item.href}>{item.text}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="builder-panel">
        <h2>Quick actions</h2>
        <div className="page-actions">
          <a className="builder-primary" href="/app/campaigns/new">
            New campaign
          </a>
          <a className="builder-secondary" href="/app/customers">
            See guests
          </a>
          <a className="builder-secondary" href="/app/loyalty">
            Edit loyalty
          </a>
        </div>
      </section>
    </main>
  );
}
