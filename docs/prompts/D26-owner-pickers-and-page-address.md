# D26: Owner pickers (suburb and type), address checks, and a safe way to change a page address

Round 9 (send with D27) | Branch: `freebuff/owner-pickers` | Migration: 0039 | Depends on: D19 (Find), D23 (operator restaurant page) merged.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's rules for this prompt:
- Fix live AND demo. The demo Settings and Your page screens have the same fields, so they get the same pickers.
- Be thorough. Every field, option and refusal needs a test. No em dashes or en dashes anywhere. Plain words for owners.
- Push only to `freebuff/owner-pickers`. Never push to main. Never touch production.

## Why
The Find page (D19) filters restaurants by neighbourhood and by type (cafe, bakery, restaurant, takeaway, other). But an owner can only type the suburb as free text ("Rosebank", "rosebank jhb", "Rosebank Joburg" all differ, so the filter misses them), and an owner cannot set the type at all: every restaurant stays "other". Also, if a restaurant's page address (for example `/r/the-daily-grind`) is mistyped and printed on QR codes, there is no way to correct it without breaking the printed codes.

## What already exists (do not rebuild)
- `src/components/patron/SuburbPicker.tsx` (a select built from `GAUTENG_SUBURBS` in `src/data/gauteng-suburbs.ts`, written for Find with an "All neighbourhoods" first option) and `src/components/patron/CategoryPicker.tsx` (filter pills for Find). They are used only by `LiveFindPage.tsx`. Do not change how Find uses them.
- `restaurant.suburb` (free text) and `restaurant.venue_type` (text, check: cafe, bakery, restaurant, takeaway, other; default other) in the database. FIND_VENUE_TYPES and `FindVenueType` are in `src/lib/live-find.ts`.
- Owner save functions: `save_owner_settings(p_user_id, p_name, p_phone, p_address, p_suburb, p_city, p_enquiry_email, p_offers_alerts, p_orders_at_till, p_marketing_cap, p_member_cap)` in `db/migrations/0022_owner_admin_dev.sql` and `save_owner_page(p_user_id, p_tagline, p_about, p_suburb, p_address, p_hours)` in `0034_page_design_live_dev.sql`. Server code: `src/server/live-admin.ts` and `src/server/live-page.ts`.
- The suburb text boxes you will replace: `src/routes/app.settings.tsx` (two places, live form and demo form), `src/components/patron/live/LivePage.tsx` and `src/routes/app.page.tsx` (demo page editor).
- Slugs: `restaurant_slug_reserved(p_slug text)` (0013) and the `slug_taken` checks in `operator_create_restaurant` (0029). The public routes are `src/routes/r.$slug.tsx`, `r.$slug.join.tsx`, `r.$slug.card.tsx`, `r.$slug.logo.tsx`. There is no way to change a slug after creation, for anyone.

## You own these files (touch nothing else)
- `db/migrations/0039_find_details_dev.sql` (new)
- `src/components/patron/VenueDetailsFields.tsx` (new, shared by live and demo) and small additions to `SuburbPicker.tsx` and `CategoryPicker.tsx` only if you need an export
- `src/lib/venue-fields.ts` (new: pure rules) and its tests
- `src/routes/app.settings.tsx`, `src/routes/app.page.tsx`, `src/components/patron/live/LivePage.tsx`
- `src/server/live-admin.ts`, `src/server/live-admin-fns.ts` (or whichever file holds the zod input for settings), `src/server/live-page.ts`, `src/server/live-page-fns.ts`, `src/lib/live-page.ts`
- Demo data layer for the new field: `src/domain/restaurants.ts` (only `updateRestaurant` accepting `venueType` and `suburb` checks), `src/data/types.ts` only if `venueType` is missing from a type
- `src/routes/r.$slug.tsx`, `r.$slug.join.tsx`, `r.$slug.card.tsx`, `r.$slug.logo.tsx` (only: follow a slug redirect, section 4)
- `src/server/live-ops-restaurants.ts`, `src/components/patron/live/ops/LiveOpsRestaurantDetail.tsx` (from D23; only: one operator function and one panel, section 4)
- Existing tests that call the two save functions: `src/test/db/owner-admin.db.test.ts`, `src/test/db/logo-page.db.test.ts`, `src/test/owner-admin-migration.test.ts`, `src/lib/live-page.test.ts` (keep them passing; update only what the new parameter needs)
- New tests: `src/test/db/find-details.db.test.ts`, `src/test/find-details-migration.test.ts`, `src/lib/venue-fields.test.ts`

## Read first
`db/migrations/0022_owner_admin_dev.sql` (`save_owner_settings`), `0034_page_design_live_dev.sql` (`save_owner_page`), `0013_create_restaurant_dev.sql`, `0029_operator_dev.sql` (`operator_create_restaurant` slug rules), `0030_find_dev.sql`, `src/components/patron/SuburbPicker.tsx`, `src/components/patron/CategoryPicker.tsx`, `src/data/gauteng-suburbs.ts`, the four screens listed above, `src/routes/r.$slug.tsx`, AGENTS.md.

## Build
### 1. Shared fields component
`VenueDetailsFields.tsx` renders two form fields with the kit's `Field` and `Select` (`src/components/patron/kit`):
- "Neighbourhood": a select with the suburbs from `GAUTENG_SUBURBS` (first option "Choose a neighbourhood", disabled) and a last option "Somewhere else, I will type it". When the saved value is not in the list, start with "Somewhere else" selected and show a text box holding the saved value. When "Somewhere else" is selected, show the text box ("Type your neighbourhood", up to 60 characters). The value passed to `onChange` is always one plain string (the chosen suburb or the typed text).
- "What kind of place is it?": a select with Cafe, Bakery, Restaurant, Takeaway, Other (values `cafe`, `bakery`, `restaurant`, `takeaway`, `other`), with the hint "Guests can find you under this type on the Find page."
Props: `suburb`, `venueType`, `onChange({ suburb, venueType })`, `disabled`. It must be keyboard usable and every control needs a visible label.

### 2. Rules (`src/lib/venue-fields.ts`)
- `normaliseSuburb(text)`: trim, collapse inner spaces, and when it matches a name in `GAUTENG_SUBURBS` ignoring case, return the official spelling. Otherwise return the cleaned text.
- `validateSuburb(text)`: 2 to 60 characters, letters, digits, spaces, apostrophes, hyphens and full stops only. Message "Use 2 to 60 letters for the neighbourhood."
- `validateVenueType(value)`: one of the five values.
- `validateAddress(text)`: empty is allowed; otherwise 5 to 200 characters, must contain at least one letter and one digit, and must not contain `http`, `www.`, `@` or a run of 9 or more digits (that is a phone number, not an address). Message "Enter your street address, for example 12 Oxford Road. Leave it empty if you would rather not show it."
- All used by the screens (before sending) AND repeated in the database (section 3).

### 3. Database (migration 0039)
- `drop function save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer);` then create it again with one more last parameter `p_venue_type text default null`. Copy the whole existing body from `0022` unchanged and add: when `p_venue_type` is not null it must be one of the five values (else `invalid_value`) and is written to `restaurant.venue_type`; null leaves it unchanged; the existing `settings_changed` audit also fires when the type changes. Re-grant: `revoke all ... from public; grant execute ... to app_user;` for the new signature.
- Same for `save_owner_page(p_user_id, p_tagline, p_about, p_suburb, p_address, p_hours)` from `0034`: drop it, recreate with `p_venue_type text default null`, copy the body, add the same rule.
- In both functions, when an address is given, apply the same rule as `validateAddress` (5 to 200 characters, a letter and a digit, no `http`, `www.`, `@`, no run of 9 or more digits) and raise `invalid_value` otherwise. When the suburb is given, apply `validateSuburb`'s character rule and the 2 to 60 length. Keep every other rule in those functions.
- `create table slug_redirect (old_slug text primary key, restaurant_id uuid not null references restaurant(id) on delete cascade, created_at timestamptz not null default now())`. Row level security enabled and forced, no direct grants to `app_user`.
- `create or replace function restaurant_slug_reserved(p_slug text)`: copy the body from `0013` and make it also return true when `p_slug` is in `slug_redirect.old_slug` (read with `app.is_operator` set to true and restored), so an old address can never be taken by someone else. Keep its grants.
- `resolve_slug_redirect(p_slug text) returns text` (SECURITY DEFINER, `set search_path = public, pg_temp`, `stable`, granted to `app_user`, callable without any context because the public pages need it): returns the CURRENT slug of the restaurant that used to have `p_slug`, but only when that restaurant is `active`; otherwise null.
- `operator_change_slug(p_operator_id text, p_restaurant_id uuid, p_new_slug text, p_reason text) returns text`: `assert_operator` first, save and restore operator like `0029`. Validate the new slug exactly like `operator_create_restaurant` does (`bad_slug`, `slug_reserved`, `slug_taken`), refuse the same slug (`same_slug`), reason 3 to 300 characters (`bad_reason`). In one transaction: insert the OLD slug into `slug_redirect` (`on conflict do nothing`), update `restaurant.slug`, and if the NEW slug was an old slug of THIS restaurant remove that redirect row. Audit `slug_changed` with old and new slug. Returns the new slug. Granted to `app_user`.
- Header comment: the printed QR codes keep working because the old address redirects to the new one.

### 4. Screens and routes
- Replace the four suburb text boxes (listed above) with `VenueDetailsFields`. Live Settings and live Your page save `venueType` along with the rest (add it to the zod input and the server function call). Demo Settings and demo Your page do the same on the demo store (`api.restaurants.update`; the demo `Restaurant` type already has `venueType`).
- Address field on Settings and Your page: run `validateAddress` on blur and on save and show its message under the field; the database repeats it.
- Public routes: in `src/routes/r.$slug.tsx`, `r.$slug.join.tsx` and `r.$slug.card.tsx`, when the page for the slug is not found in live mode, call a small server function that runs `resolve_slug_redirect`. When it returns a slug, `throw redirect({ to: <same route>, params: { slug: newSlug }, statusCode: 301 })`. When it returns null show the existing "not found" view. `r.$slug.logo.tsx` does the same for the logo URL if it already has a lookup step. Demo mode is unchanged.
- Operator page (`LiveOpsRestaurantDetail.tsx` from D23): a "Page address" panel showing `/r/<slug>`, a text box for the new address, a reason box, and a "Change address" button with a confirm that says: "Old links and printed QR codes keep working. The old address will always point to the new one." Result line under the button; the label never changes to "Saving" or "Saved". Plain-words messages for `bad_slug`, `slug_taken`, `slug_reserved`, `same_slug`, `bad_reason`. Add the server function `changeSlug` in `src/server/live-ops-restaurants.ts` using the same operator checks as the other functions there.

## Tests
- Real database (`src/test/db/find-details.db.test.ts`): owner saves a type through settings and through the page, Find (`find_restaurants` or the function from `0030`) returns the restaurant under that type; an invalid type is refused; omitting the type (null) leaves the old one; an address with `http`, an email, a 10 digit number, no digits, or 4 characters is refused, a normal address is saved; a suburb with `<` is refused; the old call shape (11 and 6 arguments without the new parameter) still works; `operator_change_slug` refused for non operators, refuses taken, reserved, bad and same slugs, creates the redirect, `resolve_slug_redirect` returns the new slug for the old one and null for an unknown one and null when the restaurant is not active; an old slug cannot be used to create another restaurant (`slug_reserved`); changing back to the old slug removes its redirect; every change writes an audit row; `slug_redirect` is not readable by `app_user`.
- Unit (`src/lib/venue-fields.test.ts`): `normaliseSuburb` (case, spaces, official spelling), the three validators with good and bad examples (include "12 Oxford Road", "Shop 4, Rosebank Mall", "www.mysite.co.za", "0821234567", "x").
- Component tests: `VenueDetailsFields` with a suburb in the list, a suburb not in the list, switching to "Somewhere else", the type select, disabled state; Settings and Your page show the address message.
- Migration text test as AGENTS.md requires.
- Browser test in demo mode (`tests/e2e/demo-owner-pickers.spec.ts`, new): open Settings, pick a neighbourhood and a type, save, reload, see them; same on Your page; an invalid address shows the message.

## Not in this prompt
Letting owners change their own page address (only an operator can, by design), neighbourhood suggestions from a map service, other cities.

## Handoff (send these lines)
Branch and last commit, the migration file, test counts, "live done / demo done" for each screen, anything unfinished, anything that surprised you.
