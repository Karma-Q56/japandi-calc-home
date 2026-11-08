# D19: Find directory (live, Patron restaurants only)

Wave 3 (start after D10, D11, D12e and D13b are merged) | Branch: `freebuff/find-live` | Migration: 0030 | Depends on: D10, D13b (D11 and D12e for branches and offers)

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
A diner can find real restaurants on Patron by name, suburb and type, see which ones are open now and which have member offers, and open a restaurant's card or join. Only restaurants that are published and chose to be listed (D10) appear. Patron restaurants only, no outside listings.

## You own these files (touch nothing else)
- `db/migrations/0030_find_dev.sql`
- `src/server/live-find.ts`, `src/server/live-find-fns.ts`, `src/lib/live-find.ts` and tests
- `src/routes/find.tsx`, `src/components/patron/VenueCard.tsx`, `Venues.tsx`, `VenueMedia.tsx`
- `src/data/gauteng-suburbs.ts` (new), `src/components/patron/SuburbPicker.tsx`, `CategoryPicker.tsx` (new)
- `src/test/db/find.db.test.ts`

## Read first
The demo `src/routes/find.tsx`, `src/lib/venue-details.ts`, `src/lib/johannesburg-time.ts` (`venueIsOpenNow`), the `restaurant` table, the opening hours in `restaurant.hours` (edited by D13b), `location` (D11), `special` (D12e).

## Build
1. **Columns.** `restaurant.venue_type` ('cafe', 'bakery', 'restaurant', 'takeaway', 'other', default 'other'), plus an index for search on name and suburb (a trigram or full text index, whichever the fresh database supports with no extra extension install; prefer `pg_trgm` only if CI's Postgres has it, otherwise a plain lowercase index and `ilike`).
2. **One public query function** `find_restaurants(p_query, p_suburb, p_type, p_limit, p_offset)` SECURITY DEFINER or a plain read through the public read policy: returns only restaurants with `status = 'active'` and `public_listed = true`, never any private field (no owner, no phone numbers of guests, no plan or credit). Max 24 per page, limit capped in SQL.
3. **Open now and member offers.** Open now is computed from `restaurant.hours` in Africa/Johannesburg time (`venueIsOpenNow` shows the demo logic and the shape). Member offers is true when an active members-only special exists. Both come from the same function so the screen never guesses.
4. **Distance.** There are no coordinates in the database. Use `gauteng-suburbs.ts` (a list of Gauteng suburbs with city and approximate centre point; accuracy of about 1 km is fine and say so in a comment). "Nearest" sorts by distance from the guest's chosen suburb or, if they allow it, their device location, computed in the browser. Never send the guest's location to the server.
5. **Screen (live mode):** the Find page with search box, suburb picker, type pills (All, Cafes, Bakeries, Restaurants, Takeaways), Open now, Member offers, sort, a clear empty state ("No restaurants found. Try another suburb.") and a plain note when nothing is listed yet. Cards show logo, name, suburb, type, open or closed, offer badge. Demo mode keeps its current page.
6. **Pickers for owners:** build `SuburbPicker` (choose from the list or type your own) and `CategoryPicker`. Do not wire them into Settings or Your page (other phases own those files). List both under "Needs from another phase" in the handoff.
7. **Abuse and privacy.** Rate limit the search by IP bucket `find-search`, 60 per minute. Escape the search text. Draft, paused and unlisted restaurants must be impossible to reach through any parameter.

## Tests
- Real database: only active and listed restaurants returned; a paused restaurant disappears at once; no private columns in the result; search by name, suburb and type; paging and the 24 cap; open now correct at fixed Johannesburg times including after midnight hours; offers flag only for active members-only specials; restaurant B's draft never appears.
- Unit: distance sort, suburb list has no duplicates, search text escaping.
- Text test of the migration as AGENTS.md requires.
