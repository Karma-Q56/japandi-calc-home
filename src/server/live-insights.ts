import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import { changeLabel, checkWindow, buildCsv, type InsightWindow } from "@/lib/live-insights";

// Insights are read only. Days are Johannesburg dates, matching the rest of the domain.
const DAY_SQL = `(s.created_at at time zone 'Africa/Johannesburg')::date`;

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer) =>
  (viewer.role === "owner" || viewer.role === "manager") && viewer.restaurantId !== null;

export type GuestsInsight = {
  window: InsightWindow;
  newGuests: number;
  newGuestsChange: string;
  returningGuests: number;
  lapsedGuests: number;
  lapsedDays: number;
  dailyNew: { day: string; count: number }[];
};

export type PerformanceInsight = {
  window: InsightWindow;
  visits: number;
  visitsChange: string;
  uniqueGuests: number;
  rewardsEarned: number;
  dailyVisits: { day: string; count: number }[];
  topItems: { name: string; quantity: number }[];
  tillOrdersEnabled: boolean;
};

export type InsightsResult =
  | { ok: true; restaurantName: string; guests: GuestsInsight; performance: PerformanceInsight }
  | { ok: false; message: string };

async function loadCore(viewer: Viewer, window: InsightWindow) {
  const prevDays = Math.round(
    (Date.parse(`${window.to}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`)) / 86400000,
  ) + 1;
  const prevFrom = new Date(Date.parse(`${window.from}T00:00:00Z`) - prevDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const restaurantId = viewer.restaurantId;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId, isOperator: false },
    async (tx) => {
      const visits = await tx.execute<{ day: string; visits: number }>(sql`
        select to_char(${sql.raw(DAY_SQL)}, 'YYYY-MM-DD') as day,
               count(*)::int as visits
        from stamp_event s
        where s.restaurant_id = ${restaurantId}
          and s.status = 'valid'
          and ${sql.raw(DAY_SQL)} between ${window.from}::date and ${window.to}::date
        group by 1 order by 1
      `);
      const unique = await tx.execute<{ n: number }>(sql`
        select count(distinct s.membership_id)::int as n from stamp_event s
        where s.restaurant_id = ${restaurantId} and s.status = 'valid'
          and ${sql.raw(DAY_SQL)} between ${window.from}::date and ${window.to}::date
      `);
      const previous = await tx.execute<{ visits: number }>(sql`
        select count(*)::int as visits from stamp_event s
        where s.restaurant_id = ${restaurantId} and s.status = 'valid'
          and ${sql.raw(DAY_SQL)} between ${prevFrom}::date and ${window.from}::date - 1
      `);
      const newGuests = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from membership m
        where m.restaurant_id = ${restaurantId}
          and (m.joined_at at time zone 'Africa/Johannesburg')::date
              between ${window.from}::date and ${window.to}::date
      `);
      const newByDay = await tx.execute<{ day: string; count: number }>(sql`
        select to_char((m.joined_at at time zone 'Africa/Johannesburg')::date, 'YYYY-MM-DD') as day,
               count(*)::int as count
        from membership m
        where m.restaurant_id = ${restaurantId}
          and (m.joined_at at time zone 'Africa/Johannesburg')::date
              between ${window.from}::date and ${window.to}::date
        group by 1 order by 1
      `);
      const returning = await tx.execute<{ n: number }>(sql`
        select count(distinct s.membership_id)::int as n from stamp_event s
        join membership m on m.id = s.membership_id
        where s.restaurant_id = ${restaurantId} and s.status = 'valid'
          and ${sql.raw(DAY_SQL)} between ${window.from}::date and ${window.to}::date
          and (m.joined_at at time zone 'Africa/Johannesburg')::date < ${window.from}::date
      `);
      const newPrev = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from membership m
        where m.restaurant_id = ${restaurantId}
          and (m.joined_at at time zone 'Africa/Johannesburg')::date
              between ${prevFrom}::date and ${window.from}::date - 1
      `);
      const lapsed = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from membership m
        where m.restaurant_id = ${restaurantId}
          and m.last_visit_at is not null
          and m.last_visit_at < now() - interval '30 days'
      `);
      const rewards = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from reward r
        where r.restaurant_id = ${restaurantId}
          and (r.earned_at at time zone 'Africa/Johannesburg')::date
              between ${window.from}::date and ${window.to}::date
      `);
      const items = await tx.execute<{ name: string; quantity: number }>(sql`
        select mi.name, sum(vi.quantity)::int as quantity
        from visit_item vi
        join menu_item mi on mi.id = vi.menu_item_id
        where vi.restaurant_id = ${restaurantId}
          and (vi.created_at at time zone 'Africa/Johannesburg')::date
              between ${window.from}::date and ${window.to}::date
        group by mi.name order by quantity desc, mi.name limit 10
      `);
      const till = await tx.execute<{ tillOn: boolean; name: string }>(sql`
        select orders_at_till as "tillOn", name from restaurant where id = ${restaurantId} limit 1
      `);
      return {
        visits: visits.rows,
        uniqueGuests: Number(unique.rows[0]?.n ?? 0),
        previousVisits: Number(previous.rows[0]?.visits ?? 0),
        newGuests: Number(newGuests.rows[0]?.n ?? 0),
        newByDay: newByDay.rows,
        returning: Number(returning.rows[0]?.n ?? 0),
        newPrev: Number(newPrev.rows[0]?.n ?? 0),
        lapsed: Number(lapsed.rows[0]?.n ?? 0),
        rewards: Number(rewards.rows[0]?.n ?? 0),
        items: items.rows,
        tillOn: till.rows[0]?.tillOn === true,
        restaurantName: till.rows[0]?.name ?? "",
      };
    },
  );
}

/** Insights for the signed-in restaurant over an inclusive from/to window. */
export async function loadInsights(
  viewer: Viewer,
  from: string,
  to: string,
): Promise<InsightsResult> {
  if (!canManage(viewer)) return { ok: false, message: "Only the owner or a manager can see insights." };
  const problem = checkWindow(from, to);
  if (problem) return { ok: false, message: problem };
  const window = { from, to };
  const core = await loadCore(viewer, window);
  const visitsTotal = core.visits.reduce((sum, row) => sum + Number(row.visits), 0);
  return {
    ok: true,
    restaurantName: core.restaurantName,
    guests: {
      window,
      newGuests: core.newGuests,
      newGuestsChange: changeLabel(core.newGuests, core.newPrev),
      returningGuests: core.returning,
      lapsedGuests: core.lapsed,
      lapsedDays: 30,
      dailyNew: core.newByDay.map((row) => ({ day: row.day, count: Number(row.count) })),
    },
    performance: {
      window,
      visits: visitsTotal,
      visitsChange: changeLabel(visitsTotal, core.previousVisits),
      uniqueGuests: core.uniqueGuests,
      rewardsEarned: core.rewards,
      dailyVisits: core.visits.map((row) => ({ day: row.day, count: Number(row.visits) })),
      topItems: core.items.map((row) => ({ name: row.name, quantity: Number(row.quantity) })),
      tillOrdersEnabled: core.tillOn,
    },
  };
}

/** Builds a CSV of daily counts. Counts and dates only, never guest details. */
export async function buildInsightsCsv(
  viewer: Viewer,
  from: string,
  to: string,
): Promise<{ ok: true; csv: string } | { ok: false; message: string; status: number }> {
  if (!canManage(viewer)) return { ok: false, message: "Only the owner or a manager can download this.", status: 403 };
  const allowed = await withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (tx) => {
      const limit = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from rate_limit_hit
        where bucket = 'report-csv' and key = ${viewer.userId}
          and created_at > now() - interval '1 hour'
      `);
      if (Number(limit.rows[0]?.n ?? 0) >= 10) return false;
      await tx.execute(sql`
        insert into rate_limit_hit (bucket, key) values ('report-csv', ${viewer.userId})
      `);
      return true;
    },
  );
  if (!allowed) return { ok: false, message: "Too many downloads in an hour. Try again later.", status: 429 };
  const result = await loadInsights(viewer, from, to);
  if (!result.ok) return { ok: false, message: result.message, status: 400 };
  const byDay = new Map<string, { visits: number; newGuests: number }>();
  for (const row of result.performance.dailyVisits) byDay.set(row.day, { visits: row.count, newGuests: 0 });
  for (const row of result.guests.dailyNew) {
    const existing = byDay.get(row.day) ?? { visits: 0, newGuests: 0 };
    byDay.set(row.day, { ...existing, newGuests: row.count });
  }
  const rows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, counts]) => ({ date: day, visits: counts.visits, new_guests: counts.newGuests }));
  return { ok: true, csv: buildCsv(["date", "visits", "new_guests"], rows) };
}
