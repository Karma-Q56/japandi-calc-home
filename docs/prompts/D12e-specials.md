# D12e: Specials (live)

Wave 1 (start now) | Branch: `freebuff/specials-live` | Migration: 0020 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Owners can create and manage real specials. There are three kinds: public (one code anyone can use), members only (one shared code for all loyalty members), and targeted exclusive (a unique code per person or group). Guests see the ones they may use, and staff redeem codes at the till.

## You own these files (touch nothing else)
- `db/migrations/0020_specials_live_dev.sql` (only if the existing `special` and `special_code` tables need columns)
- `src/server/live-specials.ts`, `src/server/live-specials-fns.ts`, `src/lib/live-specials.ts` and tests
- `src/routes/app.specials.tsx`
- `src/components/patron/GuestSpecials.tsx` (new)
- `src/test/db/specials.db.test.ts`

## Read first (the specification)
`src/domain/specials.ts`, `src/routes/app.specials.tsx` (demo screen), the `special` and `special_code` tables and grants in migrations 0001 to 0008, `docs/decisions.md` (the three kinds). Note the app role has no DELETE right on `special`: use an `active` flag or an end date instead of deleting.

## Build
1. **Server:** list, create, edit, pause and end specials for the owner's restaurant (owner or manager only). Validate title, dates (start before end, in Africa/Johannesburg time), kind, and what the special gives (free text up to 120 characters plus an optional percent or rand amount). Rate limit creating (bucket `special-create`, 20 per hour).
2. **Codes:** public and members-only specials have one shared code made on the server. Targeted specials issue one unique code per chosen guest or list. Codes are random, unambiguous characters (no 0, O, 1, I), unique per restaurant, and never guessable from earlier ones.
3. **Redeem:** add `redeem_special_code(...)` SECURITY DEFINER used by the till path: code must belong to this restaurant, be inside its dates, and a unique code can be used once. A members-only special needs a membership at that restaurant. Record the redemption and write an audit row. Retrying the same redemption never counts twice. Do not edit `src/server/live-till.ts`: expose the function and server wrapper, and say in your handoff under "Needs from another phase" where the till should call it.
4. **Screens (live mode):** the owner Specials page (list with status, create and edit form, the three kinds explained in one plain line each, pause and end with confirm). Guest side: `GuestSpecials` lists the specials the guest may use right now. Draft restaurants show nothing.
5. D10 (running in parallel) tightens the read policies so only active restaurants' specials are public. Do not loosen them.

## Tests
- Real database (do not assert who can READ a draft restaurant's specials, that belongs to D10): each kind issues the right codes; a members-only code refused for a non-member; a unique code works once and for the right guest only; expired and not-yet-started refused; restaurant B cannot see, change or redeem A's codes; shared codes are unique per restaurant; retrying redemption does not double count.
- Unit: validation, wording, code alphabet.
- Text test of the migration (if any) as AGENTS.md requires.

## Not in this phase
Tier gating for members-only specials (added later in D12b), campaigns that send a special by SMS (D15).
