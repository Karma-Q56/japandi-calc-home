# D20: Branches (locations screens, till and reports per branch)

Round 7 (send with D23) | Branch: `freebuff/branches` | Migration: 0031 | Depends on: D11 (0015 locations), D21 (0032 plan limits). Both are merged.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's rules for this prompt:
- Branches do not exist anywhere yet, not in live and not in demo. Build both. The demo is the sales tool, so the demo must show branches working with sample data.
- Be thorough. Every button, field, refusal and empty state you add needs a test.
- No em dashes or en dashes anywhere (code, comments, copy, docs). Plain language for restaurant owners.
- Push only to `freebuff/branches`. Never push to main. Never touch production.

## Goal
A restaurant brand with several branches can manage them. One loyalty card works at every branch (a guest's stamps from any branch count together). Tills and staff belong to a branch, stamps and rewards record the branch, and Insights can be filtered by branch.

## What already exists (do not rebuild it)
- Table `location` (migration `db/migrations/0015_locations_dev.sql`): `id, restaurant_id, name, address, suburb, city, is_main, active, created_at`. One main location per restaurant. Every restaurant gets a main location automatically.
- `staff_member`, `stamp_event`, `redemption` and `reward` each have a nullable `location_id`. The trigger function `fill_main_location()` fills it with the main location when it is null.
- Plan limits are already enforced. Migration `0032_billing_dev.sql` has a trigger `location_limit_guard` (function `location_limit()`, no arguments) that raises `plan_limit_locations` when a restaurant adds a location above its plan (Starter 1, Growth 3, Pro 10, from `plan_limit`). Do NOT create another limit function and do not reuse the name `location_limit`. Just turn the refusal into plain words (see Screens).
- There is no Branches screen, no server code for locations, and no demo data for locations.

## You own these files (touch nothing else)
Live:
- `db/migrations/0031_branches_dev.sql` (new)
- `src/server/live-locations.ts`, `src/server/live-locations-fns.ts`, `src/lib/live-locations.ts` (all new) and their tests
- `src/server/db/index.ts` (only: add an optional `locationId` to the context type and one more `set_config('app.location_id', ...)` call inside `withContext`)
- `src/server/live-till.ts` (only: store the branch with the pairing code and the paired device, carry it in the signed device cookie, pass `locationId` to every `withContext` call the till makes, refuse a staff member who belongs to another branch)
- `src/components/patron/LiveTill.tsx` (only: show the branch name in the header)
- `src/components/patron/LiveTeam.tsx` (only: choose a branch per staff member and per pairing code)
- `src/routes/app.locations.tsx` (new), `src/components/patron/OwnerNav.tsx` (only: add `{ to: "/app/locations", label: "Branches" }` to the `/app/settings` list inside `SECTION_TABS` (the tabs Details, Team, Feedback, Activity log) and `["/app/locations", "/app/settings"]` to the `SECTION_OF` list in the same file so Settings stays highlighted on that page)
- `src/routes/r.$slug.tsx` (only: list the branches under the restaurant name when it has more than one active branch)
- `src/server/live-insights.ts`, `src/components/patron/live/LiveInsights.tsx` (only: add the branch filter)
Demo (the same features, with sample data):
- `src/domain/locations.ts` (new, pure functions on the demo state), `src/data/types.ts` (add a `Location` type and a `locationId?: string` on the demo stamp type), `src/data/seed.ts` (give the demo restaurant `rest-daily-grind` two branches and give each demo stamp a `locationId`, even position to branch one and odd position to branch two), `src/data/repo.ts` and `src/api/index.ts` (wire it the same way `src/domain/team.ts` is wired)
- Shared screen: `src/components/patron/BranchesView.tsx` (new, presentational: takes the list and the callbacks as props, used by both the live and the demo route)
Tests: `src/test/db/branches.db.test.ts`, `src/test/branches-migration.test.ts`, `src/lib/live-locations.test.ts`, `src/domain/locations.test.ts`, `src/server/live-locations.test.ts`.

## Read first
`db/migrations/0015_locations_dev.sql` and `0032_billing_dev.sql` (the guard), `src/server/live-till.ts` (device pairing, the signed device cookie, staff sign in, `recordStampAtTill`), `src/components/patron/LiveTeam.tsx`, `src/server/db/index.ts` (`withContext`), `src/routes/app.audit.tsx` (the pattern for a route that has a live version and a demo version: `beforeLoad` and `loader` check `getDataModeFn()`), `src/server/live-insights.ts`, `src/domain/team.ts` and how `src/api/index.ts` exposes it.

## Build
### 1. Database (migration 0031)
- `create or replace function create_location(p_user_id text, p_name text, p_address text, p_suburb text, p_city text) returns uuid`. SECURITY DEFINER, `set search_path = public, pg_temp`. The caller must be an owner or manager of exactly one restaurant (look it up with the same helper the other owner functions use, `owner_restaurant_for_user(p_user_id)`; read how `save_spin_wheel` in `0035_spin_wheel_limits_dev.sql` does it and copy that pattern including saving and restoring `app.is_operator`). Name 1 to 80 characters, address up to 200, city default Johannesburg. New locations are never main. Write an audit row (`audit_event`, action `location_added`).
- `update_location(p_user_id text, p_location_id uuid, p_name text, p_address text, p_suburb text, p_city text) returns void`. The location must belong to the caller's restaurant (check it, do not trust the id). Audit `location_changed`.
- `set_main_location(p_user_id text, p_location_id uuid) returns void`. Must be active and belong to the caller's restaurant. In one transaction clear `is_main` on the old main, then set it on the new one (the unique index `location_one_main` allows only one main, so clear first). Audit `location_main_changed`.
- `deactivate_location(p_user_id text, p_location_id uuid) returns void` and `reactivate_location(...)`. The main location cannot be deactivated (`main_location`). A location is never deleted. Reactivating checks the plan limit through the existing guard: because the guard fires only on insert, add the same check inside `reactivate_location` (count active locations against `plan_limit.max_locations` and raise `plan_limit_locations`). Audit `location_deactivated` and `location_reactivated`.
- `set_staff_location(p_user_id text, p_staff_id uuid, p_location_id uuid, p_all_branches boolean) returns void`. New column on `staff_member`: `all_branches boolean not null default false`. Both ids must belong to the caller's restaurant.
- New column on the pairing code table and the paired device table the till uses (find them in `src/server/live-till.ts`: `createPairingCode` and `pairTill` show which tables): `location_id uuid references location(id)`.
- Replace `fill_main_location()` with `create or replace`. New rule when `new.location_id` is null: read `current_setting('app.location_id', true)`. If it is a valid uuid (check with the regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` BEFORE casting, so bad text never raises) and it names an ACTIVE location of `new.restaurant_id`, use it. Otherwise use the main location as today. Keep the operator save and restore exactly as the current function does.
- Every new function: `revoke all ... from public; grant execute ... to app_user;`. Refusal codes: `not_allowed`, `not_found`, `main_location`, `invalid_value`, `plan_limit_locations`.
- Reading refusals: write your own `locationRefusalCode(error)` in `src/server/live-locations.ts`. It walks the cause chain (up to 5 levels) and returns a code only when the WHOLE error message equals one of your codes exactly. Copy `wheelRefusalCode` in `src/server/live-wheel.ts`. Do not edit `src/server/live-ops.ts`.

### 2. Server code
- `src/server/live-locations.ts`: `loadLocations(viewer)` (rows with name, address, suburb, city, is_main, active, staff count, stamps in the last 30 days), `addLocation`, `editLocation`, `makeMain`, `deactivate`, `reactivate`, `assignStaff`. Every call takes the signed-in viewer from the server session (never from the browser) and uses `withContext`. Rate limit the write calls like the other owner writes (see how `src/server/live-billing.ts` `withinPaymentLimit` does it) with a bucket per action.
- `src/server/live-locations-fns.ts`: the `createServerFn` wrappers with zod input, one per function above.
- `src/lib/live-locations.ts`: pure rules and wording: `validateLocationInput`, `locationLimitMessage(plan, max)`, `refusalMessage(code)`, `branchLabel(name, isMain)`.

### 3. The till uses the branch
- When the owner makes a pairing code (Team screen) they pick the branch. The branch is saved with the code. When the till pairs, the device row and the signed device cookie carry `locationId`.
- Every `withContext({ ... })` call in `src/server/live-till.ts` gets `locationId` from the device cookie. Add `locationId?: string` to the context type in `src/server/db/index.ts`; `withContext` sets `app.location_id` to it (empty text when absent), in the same `select set_config(...)` call.
- Staff sign in at a till: if the staff member's `location_id` is not the till's branch and `all_branches` is false, refuse with the message "This team member works at another branch." No staff list leak: the refusal does not say which branch.
- The till header shows "Branch: <name>". Nothing else about the till changes.

### 4. Screens (live and demo share `BranchesView.tsx`)
- Route `/app/locations`, title "Branches". The list shows: name, address, suburb, a "Main branch" tag on the main one, an "Inactive" tag when inactive, staff count. Buttons that look like buttons (class `builder-primary` or `builder-secondary`, see `src/components/patron/kit/kit.css`). A button never changes its label to "Saving" or "Saved".
- "Add a branch" opens a form (name, address, suburb, city). Edit works the same. "Make main branch", "Deactivate" (with a confirm that says what happens: "Guests can still use their card. The till and staff for this branch stop working.") and "Reactivate".
- When the plan is full the add button stays visible and the form refuses with: "Your plan includes {max} branch(es). Ask Patron to change your plan." (Starter 1, Growth 3, Pro 10.) Never show the word "plan_limit_locations".
- Empty state for a restaurant with only its main branch: "You have one branch. Add another when you open a second place. One loyalty card works at every branch."
- Team screen: a "Branch" select per staff member plus an "All branches" checkbox. Pairing code form: a "Branch" select.
- Insights: a "Branch" select with "All branches" first. Changing it reloads the numbers filtered by `stamp_event.location_id` (live) or by the demo stamp `locationId` (demo). The Insights download follows the same filter.
- Public restaurant page: when the restaurant has more than one active branch, list the branch names and suburbs under the restaurant name. One branch: show nothing new.
- Demo mode: the same screens work on the demo store. Demo `rest-daily-grind` starts with two branches ("Rosebank" main and "Sandton"). Adding, editing, making main, deactivating and the plan limit message all work in the demo too (demo plan Growth allows 3).

### 5. What guests see
Nothing changes on the guest card. Memberships stay per restaurant. Do not duplicate cards.

## Tests (all must pass; run `pnpm test` and say the counts in your handoff)
- Real database (`src/test/db/branches.db.test.ts`, use `src/test/db-fixture.ts`): owner of A cannot add, edit, make main, deactivate or assign staff for B's location; staff and guests are refused every function; add a branch up to the plan limit then the next add raises `plan_limit_locations`; Starter refuses the second branch; main cannot be deactivated; making another branch main leaves exactly one main; a deactivated branch cannot be set in `app.location_id` (the stamp falls back to main); a bad uuid text in `app.location_id` falls back to main without an error; a location id from ANOTHER restaurant in `app.location_id` is ignored and main is used; a till paired to branch X stamps with X; stamps from two branches count on the same membership; reactivating above the limit is refused; each change writes an audit row; `set_staff_location` refuses a staff id from another restaurant.
- Unit: validation limits (name 1 to 80, address 200), `locationLimitMessage` wording for each plan, staff assignment rules (all branches vs one branch), the Insights branch filter helper, empty-state wording, no word like `plan_limit_locations` ever reaches a message.
- Demo: add, edit, make main, deactivate, limit refusal on the demo store; the seed stamps are split across the two branches; Insights filter changes the counts.
- Migration text test (`src/test/branches-migration.test.ts`) as AGENTS.md requires: every function has `set search_path = public, pg_temp`, `revoke all ... from public`, `grant execute ... to app_user`, and no function checks only an id it was given without comparing the restaurant.
- Browser test (add to a NEW file `tests/e2e/demo-branches.spec.ts`): open `/app/locations` in demo, add a branch, edit it, make it main, deactivate it, see the plan message when full, open Insights and change the branch filter.

## Not in this prompt
Reports per branch beyond the Insights filter, branch-specific menus or specials, branch-specific rewards, moving a guest's card between branches. Say so in the handoff if you think any of these are needed.

## Handoff (send these lines)
Branch name and last commit, the migration file, the number of tests, for each item "live done / demo done", anything you could not finish, and anything that surprised you.
