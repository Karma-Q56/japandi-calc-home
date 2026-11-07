# D14: Insights and Reports become one live page

Wave 3 (start after D13c is merged) | Branch: `freebuff/insights-live` | Migration: 0025 (only if you need views or indexes) | Depends on: D13c

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
One Insights page with two tabs, using real data. Guests tab: what to do next (regulars slipping away, busiest and quietest times, birthdays, new guests, what guests order, with a one-tap way to start a campaign for that group). Performance tab: the numbers (visits over time, new and returning guests, rewards given, campaign results, estimated sales, top offers) with a date range and a CSV download. The two old pages repeated two charts; each chart now exists once.

## You own these files (touch nothing else)
- `src/server/live-insights.ts`, `src/server/live-insights-fns.ts`, `src/lib/live-insights.ts` and tests
- `src/routes/app.insights.tsx`, `src/routes/app.reports.tsx` (in live mode the reports route redirects to the Performance tab)
- `src/routes/api/reports.csv.ts` (new, owner download)
- `src/components/patron/TrendChart.tsx` (only if needed)
- `db/migrations/0025_insights_dev.sql` (optional: views or indexes only)
- `src/test/db/insights.db.test.ts`

## Read first (the specification)
`src/domain/insights.ts`, `reports.ts`, `dash.ts`, the two demo routes, `src/lib/home-metrics.ts`, `src/lib/johannesburg-time.ts`.

## Build
1. **Queries.** Each number comes from a SQL query through `withContext`, scoped to the owner's restaurant by row level security. Dates and weekdays use Africa/Johannesburg time. Ranges: 7, 30, 90 days and custom, limited to 400 days. Never load whole tables into the server to count them in JavaScript.
2. **What guests order** reads `visit_item` from D13c; when no orders exist show a plain empty state that explains how to turn on "Orders at the till".
3. **Segments to campaign.** "Regulars slipping away" and similar cards link to `/app/campaigns/new?audience=<segment>`; D15 reads that parameter. Do not edit the campaigns routes.
4. **CSV.** Owner or manager only, one restaurant, no guest phone numbers or names in the file (counts and dates only), rate limited (bucket `report-csv`, 10 per hour).
5. **Honesty rules.** Estimated sales say "estimate" and show how they are worked out. A range with no data says so. Percent change against an empty earlier period shows "no earlier data" instead of minus 100 percent.
6. In live mode show real data or an empty state, never sample numbers. Demo mode keeps its current pages.

## Tests
- Real database with explicit timestamps: each metric against a hand-built set of visits; zero data; range edges; restaurant B's rows never appear in A's numbers; custom range over 400 days refused.
- Unit: percent change and empty-period wording, CSV columns contain no personal data.
- Text test of the migration if you add one.
