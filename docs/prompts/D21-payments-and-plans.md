# D21: Plans, billing and payments

Wave 4 (start after D18 is merged; best after D20) | Branch: `freebuff/billing` | Migration: 0032 | Depends on: D18

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Patron gets paid. Two routes, both real: restaurants on the lower plans pay online by card, and restaurants on the "we do everything for you" plan are invoiced and the operator marks the invoice paid. Plan limits are enforced on the server. You cannot test against a real payment provider from here, so build against a provider interface, test with recorded provider messages, and Karma does one sandbox test later.

## You own these files (touch nothing else)
- `db/migrations/0032_billing_dev.sql`
- `src/config/plans.ts` (limits and prices as data), `src/server/billing/*` (new), `src/server/live-billing.ts`, `src/server/live-billing-fns.ts`, `src/lib/live-billing.ts` and tests
- `src/routes/app.billing.tsx` (new, owner "Plan and billing"), `src/routes/api/webhooks/payments.ts` (new)
- `src/routes/ops.credit.tsx` and `ops.restaurants.$id.tsx` (only: add invoice actions; D18 owns the rest)
- `src/test/db/billing.db.test.ts`

## Read first
`src/config/plans.ts`, `src/routes/pricing.tsx` (the prices shown to the public must match the data), the `payment` table and `credit_ledger`, `docs/decisions.md`, D15 (credit top up request) and D18 (operator credit).

## Build
1. **Plans as data.** One source in `src/config/plans.ts`: for each plan tier its monthly price in cents, included SMS credit, maximum locations, and which features are on. The pricing page reads from it. Plan limits are enforced by the server and by the database: a trigger refuses a new location above the plan limit (code `plan_limit_locations`) and update the `location_limit` function left by D20.
2. **Provider interface.** `PaymentProvider { createCheckout, verifyWebhook, parseEvent }`. Implement PayFast first (the most common South African provider): hosted checkout redirect, subscription for the monthly plan, one-off checkout for credit top ups. Validate the ITN: check the signature, confirm the amount and merchant id, confirm the source with the provider's server-to-server validation call, and make the handler idempotent on the payment reference. Never trust the amount or plan sent from the browser: the server builds every checkout from the plan data and the restaurant's own row.
3. **Money rules.** A successful top up writes one `topup` ledger entry with reference `payment:<id>` inside the same transaction that marks the payment `paid`, so a repeated webhook adds nothing. Failed and cancelled payments change nothing. Refunds are an operator action that writes a `refund` entry with a note.
4. **Invoices for the managed plan.** The operator creates an invoice (restaurant, amount, due date, description), the owner sees it in "Plan and billing" with the banking details from environment settings (never in code), the operator marks it paid with the payment reference, and the credit or plan change follows. Every step writes an audit row.
5. **Owner screen (live):** current plan and what it includes, usage against limits (branches, SMS credit), payment history, invoices, "Top up credit" (choose an amount, redirected to checkout), "Change plan" for online plans, and plain statements of what happens at a failed payment (grace period of 7 days, then campaigns pause, never the till). The till and loyalty keep working for every restaurant whatever the payment state.
6. **Secrets** are read from the environment (`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_MODE` of `sandbox` or `live`). With none set, checkout refuses with a clear message and the screen says payments are not switched on yet.

## Tests
- Real database: one webhook delivered three times credits once; wrong amount, wrong merchant and bad signature refused with nothing written; owner of A cannot read or pay B's invoices; the location limit trigger refuses the extra branch; operator marks an invoice paid once; failed payment leaves the balance unchanged.
- Unit with recorded PayFast messages (signature fixtures built in the test, no network): signature check, amount check, parse of success, failure, cancelled; checkout built from plan data only.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
Taking a real payment (Karma's sandbox test), tax invoices for SARS (the lawyer and accountant step in D22).
