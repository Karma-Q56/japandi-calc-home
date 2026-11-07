# D15: New campaign, credit and saved lists (live)

Wave 1 (start now) | Branch: `freebuff/campaigns-live` | Migration: 0026 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
An owner can write a real campaign, choose who gets it, see the exact cost, schedule it, and have the money set aside. Nothing is sent in this phase (sending is D16). Credit and saved lists become real too.

## You own these files (touch nothing else)
- `db/migrations/0026_campaigns_live_dev.sql`
- `src/server/live-campaign-create.ts`, `src/server/live-credit.ts`, `src/server/live-lists.ts`, their `-fns.ts` wrappers, `src/lib/live-campaigns.ts`, `src/lib/sms-segments.ts` (new) and tests
- `src/routes/app.campaigns.new.tsx`, `src/routes/app.credit.tsx`, `src/routes/app.lists.tsx`
- `src/test/db/campaigns-live.db.test.ts`

## Read first (the specification)
`src/domain/campaigns.ts`, `audiences.ts`, `credit.ts`, `sms.ts`, `src/lib/segments.ts`, the demo versions of the three routes, the `campaign`, `message`, `credit_ledger` and `saved_list` tables and enums in `db/schema.sql`, and the existing live read and approve code in `src/server/live-actions.ts`. Message limits and quiet hours are in `docs/decisions.md`.

## Build
1. **Estimate.** `src/lib/sms-segments.ts`: count SMS segments exactly (GSM 7-bit: 160 single, 153 per part; any other character switches to Unicode: 70 single, 67 per part; extended GSM characters count double). The same function is used by the screen and the server. Test with plain text, rand signs, emoji, curly quotes.
2. **Audience.** Port the demo audiences (all opted in, lapsed N days, birthdays this month, new this week, by tier when D12b exists, saved list) to SQL. Only guests with a valid marketing opt-in for THIS restaurant count, minus anyone over the weekly cap, minus withdrawn consent. Return recipients and segments and cost for the estimate. The estimate is a number to show; the real recipient list is made at send time in D16, after consent is checked again.
3. **`create_campaign(...)`** SECURITY DEFINER, called by owner or manager. Validates name, message (1 to 600 characters), audience JSON shape, schedule (not in the past, not inside quiet hours 20:00 to 08:00 Africa/Johannesburg), unique code (3 to 12 letters and digits). Status becomes `pending_approval` when the restaurant's plan requires it, otherwise `scheduled`. It reserves the estimated cost in `credit_ledger` (`entry_type = 'reserve'`, negative amount, reference `reserve:<campaign id>` so a retry cannot reserve twice) and refuses with `not_enough_credit` when the balance is too low. Cancelling releases the reserve (check the existing cancel path does, fix it if not, with a reference `release:<campaign id>`).
4. **Credit screen (live):** balance, reserved, available, the ledger list (plain wording per entry type), a low credit warning below R50, and a "Request a top up" button that records a request an operator can see (reuse `lead` or `payment` with status pending; online payment comes in D21).
5. **Lists screen (live):** create, rename and delete saved lists (the `saved_list` table), choose a list as a campaign audience.
6. **New campaign screen (live):** steps for offer and wording (live character and segment counter), audience (with the live recipient count), schedule, review (cost in rands, remaining credit, plain consent note), then Create. Read `?audience=<segment>` from the address to preselect an audience (Insights links here). Channel picker shows SMS only for now. One primary button per step.

## Tests
- Real database: reserve once under retry; refuse when credit is short; balance never negative through your function; B cannot see or create against A; guest and staff refused; quiet hours and past times refused; cancel releases exactly the reserve; audience counts exclude non-consenting, withdrawn and over-cap guests; duplicate code refused.
- Unit: segment counter table, wording, estimate maths in whole cents.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
Sending, delivery reports, STOP replies, cost settling (D16), push (D17), online payment (D21).
