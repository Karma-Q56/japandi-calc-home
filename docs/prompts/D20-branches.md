# D20: Branches (locations screens, till and reports per branch)

Wave 4 (start after D10, D11, D13a, D14 and D19 are merged) | Branch: `freebuff/branches` | Migration: 0031 | Depends on: D11 and the screens above

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
A restaurant brand with several branches can manage them. One loyalty card works at every branch by default (a guest's stamps from any branch count together). Staff and tills belong to a branch, stamps and orders record the branch, and reports can be filtered by branch.

## You own these files (touch nothing else)
- `db/migrations/0031_branches_dev.sql`
- `src/server/live-locations.ts`, `src/server/live-locations-fns.ts`, `src/lib/live-locations.ts` and tests
- `src/routes/app.locations.tsx` (new), `src/components/patron/OwnerNav.tsx` (add one nav item, only when the restaurant has more than one location or the owner clicks "Add a branch" on Settings), `src/components/patron/LiveTeam.tsx`
- `src/server/live-till.ts` (only the device pairing and the context setting described below), `src/components/patron/LiveTill.tsx` (only: show the branch name)
- `src/routes/r.$slug.tsx` (only: list branches under the restaurant name)
- `src/routes/app.insights.tsx`, `src/server/live-insights.ts` (only: add the branch filter)
- `src/test/db/branches.db.test.ts`

## Read first
D11's migration 0015 and its triggers, `src/server/live-till.ts` (device and staff cookies), `src/components/patron/LiveTeam.tsx`, the Insights route from D14, the public restaurant page.

## Build
1. **Functions.** `create_location`, `update_location`, `deactivate_location` (SECURITY DEFINER, owner or manager of that restaurant, audit rows). The main location cannot be deactivated and cannot be made non-main without choosing another main in the same call. A location with history is deactivated, never deleted.
2. **Branch on the till.** Pairing a till device records its location in the signed device cookie. Each till request sets `app.location_id` in the request context. Update the D11 trigger functions (`create or replace`) so they prefer `current_setting('app.location_id', true)` when it names an active location of the same restaurant, and fall back to the main location. Staff can be assigned to one location or "all branches".
3. **Screens.** Locations page: list with name, address, suburb, active, staff count, the main one marked; add, edit, deactivate with confirm. Team page: choose a branch per staff member. Till shows "Branch: Sandton" in the header. The public restaurant page shows the branch list. Insights gets a branch picker (All branches by default).
4. **One card across branches.** Memberships remain per restaurant. Do not duplicate cards. A guest's card page does not change.
5. **Plan limits are D21's job.** Do not enforce a number of branches here; leave one clearly named function `location_limit(p_restaurant_id)` that returns a very large number for now and say so in your handoff.

## Tests
- Real database: owner of A cannot create, edit or deactivate B's location; staff and guests refused; a till paired to branch X stamps with X; no location in context falls back to main; a foreign or inactive location in context is ignored and the main one used; main cannot be deactivated; stamps from two branches count on the same membership; the activity trail records each change.
- Unit: Team assignment rules, branch filter wording, empty states.
- Text test of the migration as AGENTS.md requires.
