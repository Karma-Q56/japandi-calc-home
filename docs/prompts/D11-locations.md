# D11: Branch-ready data (no screens)

Wave 1 (start now) | Branch: `freebuff/locations-data` | Migration: 0015 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Prepare the database so a restaurant (brand) can later have several branches, with one loyalty card across all of them. Every restaurant gets one main location automatically and every stamp, staff member and redemption quietly records which location it belongs to. Nothing changes for owners or guests yet.

## You own these files (touch nothing else)
- `db/migrations/0015_locations_dev.sql`
- `src/test/db/locations.db.test.ts`
- `src/test/locations-migration.test.ts` (text test)

## Build
1. **Table `location`**: `id uuid`, `restaurant_id` (cascade), `name text` (1 to 80), `address text` (max 200), `suburb`, `city` (default Johannesburg), `is_main boolean`, `active boolean default true`, `created_at`. One main location per restaurant (partial unique index on `restaurant_id where is_main`). Row level security enabled and forced: tenant write policy as in 0001, and read allowed when the restaurant is active (public pages and Find will need it later). Grant select, insert, update to `app_user` (no delete).
2. **Backfill and automatic main location.** Insert a main location for every existing restaurant (name = the restaurant's name, suburb and city copied). Add a trigger so every new restaurant gets one. The trigger function is SECURITY DEFINER and forced RLS applies to it too, so it needs operator context: copy the save and restore pattern from 0013.
3. **Nullable `location_id` column** (references location, on delete set null) on `staff_member`, `stamp_event`, `redemption` and `reward`. Add a BEFORE INSERT trigger on each that fills `location_id` with the restaurant's main location when it is null. Same save and restore pattern.
4. **Do NOT change `record_stamp()` or any other existing function.** The triggers make that unnecessary, and other phases are editing those functions at the same time.
5. Memberships stay per restaurant (brand). One card across branches is the default, so no location column there.

## Tests
- Real database: every existing and newly created restaurant has exactly one main location; a second main location is refused; inserting a stamp event, staff member, reward and redemption without a location gets the main one; restaurant B cannot read or change A's locations unless A is active (read) and never change; operator power is not left on after any trigger fires (`current_setting('app.is_operator')` is `false` and `select count(*) from app_user` is 0 afterwards); app_user cannot delete a location.
- Text test of the migration file as AGENTS.md requires.

## Not in this phase
Any screen, branch picker, per-branch reports or per-branch staff (D20).
