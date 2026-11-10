import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import {
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
} from "@/components/patron/dash";
import { reportCsv, type ReportRange, type Reports } from "@/domain/reports";
import { getDataModeFn } from "@/server/live";

export const Route = createFileRoute("/app/reports")({
  beforeLoad: async () => {
    // Live mode reports now live on the Insights Performance tab (D14).
    const { mode } = await getDataModeFn();
    if (mode === "live") throw redirect({ to: "/app/insights", search: { range: 30, tab: "performance" } });
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: ReportsPage,
});

const RANGES: ReportRange[] = [7, 14, 30, 90];

function rands(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function change(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "New in this range";
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "Same as before";
  return `${percent > 0 ? "+" : ""}${percent}% vs the period before`;
}

function ReportsPage() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [days, setDays] = useState<ReportRange>(30);
  const result = api.reports.owner({
    restaurantId: restaurant.id,
    days,
    session: { role: state.session.role, restaurantId: state.session.restaurantId },
  });

  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow={`Reports · ${restaurant.name}`}
          title="We could not build your report."
          intro={result.error.message}
        />
        <a className="builder-secondary" href="/app">
          Back to the overview
        </a>
      </main>
    );
  }
  return <ReportsBody restaurant={restaurant} days={days} onDays={setDays} report={result.data} />;
}

function ReportsBody({
  restaurant,
  days,
  onDays,
  report,
}: {
  restaurant: { name: string; trackOrders?: boolean | undefined };
  days: ReportRange;
  onDays: (value: ReportRange) => void;
  report: Reports;
}) {
  const [printed, setPrinted] = useState(false);
  const series = useMemo(() => report.series, [report.series]);
  const hourData = report.busiestHours;

  const download = () => {
    const csv = reportCsv(report, restaurant.name);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${restaurant.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report-${days}-days.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="demo-hub page-width reports-page">
      <PageHeader
        eyebrow={`Reports · ${restaurant.name}`}
        title="The numbers, and what they mean."
        intro="Every number comes from your own stamps, orders and messages. The period before is shown beside it so you can see what changed."
        actions={
          <>
            <button className="builder-secondary" onClick={download}>
              Download CSV
            </button>
            <button
              className="builder-secondary"
              onClick={() => {
                setPrinted(true);
                window.print();
              }}
            >
              Print view
            </button>
          </>
        }
      />

      <div className="reports-range" role="group" aria-label="Report period">
        {RANGES.map((range) => (
          <button
            key={range}
            className={`reports-range-button${range === days ? " is-active" : ""}`}
            aria-pressed={range === days}
            onClick={() => onDays(range)}
          >
            {range} days
          </button>
        ))}
      </div>

      <StatGrid>
        <StatCard
          value={report.visits}
          label={`Visits in ${days} days`}
          hint={change(report.visits, report.previousVisits)}
        />
        <StatCard
          value={`${report.returnRate}%`}
          label="Guests who came back"
          hint={`${report.returningGuests} of ${report.uniqueGuests} guests. Before: ${report.previousReturnRate}%`}
        />
        <StatCard
          value={report.uniqueGuests}
          label="Unique guests"
          hint={change(report.uniqueGuests, report.previousUniqueGuests)}
        />
        <StatCard
          value={report.newMembers}
          label="New members"
          hint={change(report.newMembers, report.previousNewMembers)}
        />
        <StatCard
          value={rands(report.estimatedSalesCents)}
          label="Estimated sales"
          hint={
            report.salesBasis === "bills"
              ? "From real till bills"
              : report.salesBasis === "mixed"
                ? "Till bills plus menu average"
                : "Menu average, no till bills yet"
          }
        />
        <StatCard
          value={rands(report.discountCents)}
          label="Discount given"
          hint={`${report.discountCount} reward${report.discountCount === 1 ? "" : "s"} or offer${report.discountCount === 1 ? "" : "s"} redeemed`}
        />
      </StatGrid>

      <section className="builder-panel reports-basis">
        <h2>How estimated sales were worked out</h2>
        <p>{report.notes[0]}</p>
        <p className="demo-data-note">
          {report.billedVisits > 0
            ? `${report.billedVisits} visit${report.billedVisits === 1 ? "" : "s"} had a real bill. The rest were estimated at R${(report.averageItemCents / 100).toFixed(2)} each, your average menu price.`
            : "No visit had a recorded bill, so every visit used your average menu price."}{" "}
          Previous period: {rands(report.previousEstimatedSalesCents)}.
        </p>
      </section>

      <section className="builder-panel">
        <h2>Visits over time</h2>
        <p className="demo-data-note">Your period in terracotta, the period before in grey.</p>
        <div className="reports-chart" role="img" aria-label="Line chart of visits compared with the period before">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-ink)" }}
                minTickGap={28}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-ink)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
                labelStyle={{ color: "var(--ink)" }}
              />
              <Line
                type="monotone"
                dataKey="visits"
                name="This period"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={days <= 14}
              />
              <Line
                type="monotone"
                dataKey="previous"
                name="Period before"
                stroke="var(--muted-ink)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="reports-two">
        <section className="builder-panel">
          <h2>Busiest hours</h2>
          <p className="demo-data-note">Stamped visits by hour of day.</p>
          <div className="reports-chart" role="img" aria-label="Bar chart of visits by hour of day">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourData} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--muted-ink)" }}
                  interval={3}
                  tickLine={false}
                  axisLine={{ stroke: "var(--line)" }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="visits" name="Visits" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="builder-panel">
          <h2>Busiest days</h2>
          <ul className="reports-rank">
            {report.busiestDays.slice(0, 7).map((row) => (
              <li key={row.weekday}>
                <span>{row.label}</span>
                <strong>{row.visits}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="builder-panel">
        <h2>Campaign performance</h2>
        <p className="demo-data-note">
          A guest counts as a visit when they get a stamp within seven days of the send.
        </p>
        {report.campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns went out in this period"
            hint="Send a campaign and this table will show delivery and the visits that followed."
            action={
              <a className="builder-primary" href="/app/campaigns/new">
                New campaign
              </a>
            }
          />
        ) : (
          <DataTable
            caption="Campaign performance in this period"
            columns={[
              { key: "name", header: "Campaign", cell: (row: (typeof report.campaigns)[number]) => row.name },
              { key: "sent", header: "Sent", cell: (row: (typeof report.campaigns)[number]) => row.sent },
              {
                key: "delivered",
                header: "Delivered",
                cell: (row: (typeof report.campaigns)[number]) => row.delivered,
              },
              {
                key: "visited",
                header: "Visited in 7 days",
                cell: (row: (typeof report.campaigns)[number]) => row.visited,
              },
            ]}
            rows={report.campaigns}
          />
        )}
      </section>

      <div className="reports-two">
        <section className="builder-panel">
          <h2>Top offers</h2>
          {report.topOffers.length === 0 ? (
            <EmptyState title="No rewards or offers redeemed yet" />
          ) : (
            <ul className="reports-rank">
              {report.topOffers.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="builder-panel">
          <h2>Top guests</h2>
          {report.topGuests.length === 0 ? (
            <EmptyState title="No stamped visits in this period" />
          ) : (
            <ul className="reports-rank">
              {report.topGuests.map((row) => (
                <li key={row.name}>
                  <span>{row.name}</span>
                  <strong>
                    {row.visits} visit{row.visits === 1 ? "" : "s"}
                    {row.spendCents === null ? "" : ` · ${rands(row.spendCents)}`}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="builder-panel">
        <h2>Top ordered items</h2>
        {!restaurant.trackOrders ? (
          <EmptyState
            title="Order tracking is off"
            hint="Turn it on in settings so the till records what guests had. This report fills in from then."
            action={
              <a className="builder-secondary" href="/app/settings">
                Open settings
              </a>
            }
          />
        ) : report.topItems.length === 0 ? (
          <EmptyState title="No items recorded at the till yet" />
        ) : (
          <ul className="reports-rank">
            {report.topItems.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>{row.qty}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="builder-panel reports-worth">
        <h2>Is Patron worth it?</h2>
        <div className="reports-worth-grid">
          <div>
            <strong>{report.worth.additionalVisits}</strong>
            <span>extra visits we can attribute to campaigns and rewards</span>
          </div>
          <div>
            <strong>{rands(report.worth.averageSpendCents)}</strong>
            <span>average spend per visit in this period</span>
          </div>
          <div>
            <strong>{rands(report.worth.valueCents)}</strong>
            <span>estimated value of those visits</span>
          </div>
          <div>
            <strong>−{rands(report.worth.planFeeCents + report.worth.smsCostCents)}</strong>
            <span>
              {report.worth.planLabel} plus {rands(report.worth.smsCostCents)} in messages
            </span>
          </div>
          <div className={report.worth.netCents >= 0 ? "is-good" : "is-bad"}>
            <strong>
              {report.worth.netCents < 0 ? "−" : ""}
              {rands(Math.abs(report.worth.netCents))}
            </strong>
            <span>{report.worth.netCents >= 0 ? "estimated net gain" : "estimated net cost"}</span>
          </div>
        </div>
        <p className="demo-data-note">
          This is an honest estimate, not a promise. It counts a guest once when their stamp follows a
          campaign within seven days, plus every redeemed reward or offer. It assumes each extra visit
          brings your average spend. Plan fees are illustrative. Your real bill and accountant know best.
        </p>
        {report.worth.netCents < 0 && (
          <p className="reports-hint">
            The period is in the red. That can be normal for a quiet month. Try a smaller campaign, a
            quieter day offer, or check that your plan still matches how often you send.
          </p>
        )}
      </section>

      {printed && (
        <p className="demo-data-note" role="status">
          The print sheet shows this page as you see it. Charts are included.
        </p>
      )}
    </main>
  );
}
