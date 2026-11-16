# D23: Operator console, live (part 1: restaurants, credit, top ups, invoices, refunds)

Round 7 (send with D20) | Branch: `freebuff/operator-live-a` | Migration: 0036 | Depends on: D18 (0029 operator functions) and D21 (0032 billing). Both are merged.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's rules for this prompt:
- Today the operator console only works in demo mode. The pages in `src/routes/ops.*.tsx` read `demoRepo` and call `requireRole("operator")(demoRepo.read().session)`. In live mode they send the operator to the login page, and no screen calls the server functions in `src/server/live-ops-fns.ts`. Karma runs the business from this console, so the live version must work.
- Where a demo page already exists, keep the demo behaviour exactly and add the live behaviour next to it. Features that handle real money (top up confirmation, invoices, refunds) exist only in live. Say which in the handoff.
- Be thorough. Every button, field and refusal needs a test. No em dashes or en dashes anywhere. Plain words.
- Push only to `freebuff/operator-live-a`. Never push to main. Never touch production.

## Goal
A signed-in Patron operator, in live mode, can: see all restaurants, open one, change its status and plan, add or take away credit, confirm or reject an EFT top up request, create and mark invoices, void an invoice, record a refund, and create a new restaurant for an owner. Every action writes an audit row and shows a plain-words result.

## What already exists (do not rebuild)
- Write functions (migrations `0029_operator_dev.sql` and `0032_billing_dev.sql`), all SECURITY DEFINER and guarded by `assert_operator(p_operator_id text)`: `operator_set_restaurant_status(p_operator_id, p_restaurant_id, p_status, p_reason)`, `operator_set_restaurant_plan(...)`, `operator_add_credit(p_operator_id text, p_restaurant_id uuid, p_type ledger_entry_type, p_amount_cents integer, p_note text, p_reference text)`, `operator_decide_campaign(...)` (belongs to D24), `operator_create_restaurant(...)`, `operator_create_invoice(p_operator_id text, p_restaurant_id uuid, p_amount_cents integer, p_description text, p_due date)`, `operator_mark_invoice_paid(text, uuid, text, text)`.
- Server wrappers in `src/server/live-ops.ts` (`setRestaurantStatus`, `setRestaurantPlan`, `addCredit`, `createRestaurantForOwner`; private helpers `requireOperator` and `runAsOperator`) and `src/server/live-billing.ts` (`createLiveInvoice`), server functions in `src/server/live-ops-fns.ts`.
- There are NO read functions for operators and NO live screens.

## You own these files (touch nothing else)
- `db/migrations/0036_operator_restaurants_dev.sql` (new)
- `src/server/live-ops-restaurants.ts`, `src/server/live-ops-restaurants-fns.ts`, `src/lib/live-ops-restaurants.ts` (new) and tests
- `src/routes/ops.tsx` (only if the shell blocks live operators; read it first), `src/routes/ops.restaurants.tsx`, `src/routes/ops.restaurants.$id.tsx`, `src/routes/ops.restaurants.new.tsx`, `src/routes/ops.credit.tsx`
- New components under `src/components/patron/live/ops/` (one file per screen: `LiveOpsRestaurants.tsx`, `LiveOpsRestaurantDetail.tsx`, `LiveOpsNewRestaurant.tsx`, `LiveOpsCredit.tsx`)
- `src/server/live-billing.ts` (only: if you need an export for invoices; do not change what it does)
- Tests: `src/test/db/operator-restaurants.db.test.ts`, `src/test/operator-restaurants-migration.test.ts`, `src/lib/live-ops-restaurants.test.ts`
Do not touch `ops.campaigns.tsx`, `ops.leads.tsx`, `ops.feedback.tsx`, `ops.ideas.tsx`, `ops.outbox.tsx` (D24 owns them) or `ops.restaurants.$id.look.tsx` (operator help mode, later).

## Read first
`src/routes/ops.tsx` (how the shell decides who may enter in live mode), `src/server/live-ops.ts`, `src/server/live-ops-fns.ts`, `src/routes/app.audit.tsx` (the pattern: `beforeLoad` and `loader` check `getDataModeFn()` and the component picks a live or a demo view), the demo pages you are adding live versions of, `db/migrations/0029_operator_dev.sql`, `db/migrations/0032_billing_dev.sql`, the `ledger_entry_type` and `payment_status` enums, AGENTS.md rules about `withContext` and SECURITY DEFINER.

## Build
### 1. Database (migration 0036)
Every function: SECURITY DEFINER, `set search_path = public, pg_temp`, first line `perform assert_operator(p_operator_id);`, then `revoke all ... from public; grant execute ... to app_user;`. Save and restore `app.is_operator` exactly as `0029` does. Reads must never return guest phone numbers or names.
- `operator_list_restaurants(p_operator_id text, p_search text, p_status text, p_limit integer, p_offset integer)` returns a table: `id, name, slug, status, plan, suburb, created_at, members integer, last_stamp_at timestamptz, credit_cents bigint, owner_email text, active_locations integer`. Search matches name, slug or owner email (case insensitive, `ilike` with the user text escaped for `%` and `_`). Limit between 1 and 200, default 50. Order by name.
- `operator_restaurant_detail(p_operator_id text, p_restaurant_id uuid) returns jsonb` with: the restaurant row (name, slug, status, plan, suburb, created_at), owners and managers (email, role), counts (members, stamps in the last 30 days, active locations), credit balance in cents, the last 20 credit ledger rows (type, amount, note, reference, created_at), the last 20 `audit_event` rows for this restaurant (action, actor_type, created_at, meta), the last 10 invoices, the last 10 payments (kind, amount, status, reference, created_at, plus `refunded_cents`), and pending top ups. Raise `restaurant_not_found` when the id does not exist.
- `operator_pending_topups(p_operator_id text)` returns pending EFT top up requests across all restaurants: `payment_id, restaurant_id, restaurant_name, amount_cents, reference, created_at` (rows in `payment` with `kind = 'topup'`, `status = 'pending'` and `provider = 'manual_eft'`; card payments from PayFast have a different `provider`).
- `operator_confirm_topup(p_operator_id text, p_payment_id uuid, p_note text) returns void`: the payment must be a pending top up (else `not_pending`). Set it to `confirmed` with `confirmed_by = p_operator_id` and `confirmed_at = now()`, add a ledger row of type `topup` for the payment amount with reference `payment:<id>` (the ledger reference is unique, so a second confirm cannot double pay: check `not_pending` first and let the unique reference be the safety net), audit `topup_confirmed`.
- `operator_reject_topup(p_operator_id text, p_payment_id uuid, p_reason text) returns void`: pending top up only; set it to `rejected` (the value already exists in the `payment_status` enum, which now has pending, confirmed, rejected, paid, failed, cancelled) and fill `confirmed_by` and `confirmed_at` the same way; no credit moves; audit `topup_rejected`.
- `operator_list_invoices(p_operator_id text, p_status text, p_limit integer)`: invoices with restaurant name, amount, description, due date, status, paid_at.
- `operator_void_invoice(p_operator_id text, p_invoice_id uuid, p_reason text) returns void`: only an `open` invoice (`not_open` otherwise); audit `invoice_voided`.
- Refunds. Explain in a header comment: a refund here means Patron gave money back to a restaurant for a card or EFT payment. The money itself is returned by hand (in the PayFast dashboard or by EFT). This function only RECORDS it so the credit balance and the books match. New table `refund (id uuid primary key default gen_random_uuid(), payment_id uuid not null references payment(id), restaurant_id uuid not null references restaurant(id), amount_cents integer not null check (amount_cents > 0), reason text not null check (char_length(reason) between 3 and 300), created_by text not null, created_at timestamptz not null default now())`, row level security enabled and forced, no direct grants to `app_user` (functions only). `operator_record_refund(p_operator_id text, p_payment_id uuid, p_amount_cents integer, p_reason text) returns uuid`: the payment must be `paid` or `confirmed` and its `kind` must be `topup` or `subscription` (`not_refundable`); amount from 1 up to the payment amount minus refunds already recorded for it (`amount_too_large`); for a top up the restaurant must still hold at least that much credit, otherwise raise `credit_already_used`, and the function adds a negative ledger row of type `refund` with reference `refund:<id>`; for a monthly plan payment nothing else changes. Audit `refund_recorded` with the amount. A refund never changes the restaurant's plan (the operator does that with the plan function).
- Refusal codes you introduce: `not_pending`, `not_open`, `not_refundable`, `amount_too_large`, `credit_already_used`, `invalid_value`. Keep the existing ones.

### 2. Server code
- `src/server/live-ops-restaurants.ts`: `listRestaurants(viewer, filters)`, `restaurantDetail(viewer, id)`, `pendingTopups(viewer)`, `confirmTopup`, `rejectTopup`, `listInvoices`, `voidInvoice`, `recordRefund`, plus a `markInvoicePaid` wrapper if `live-ops.ts` does not have one. Each starts with `requireOperator(viewer)` (the operator comes from the server session, never from the browser) and calls the SQL function through `withContext` with the operator user id. Write your own `opsRefusalCode(error)` that walks the cause chain and matches the whole message exactly (copy `wheelRefusalCode` in `src/server/live-wheel.ts`) and your own plain-words message table. Rate limit every write (bucket per action, same style as `withinPaymentLimit` in `src/server/live-billing.ts`).
- `src/server/live-ops-restaurants-fns.ts`: `createServerFn` wrappers with zod input.
- `src/lib/live-ops-restaurants.ts`: pure helpers: `formatRandFromCents`, `statusLabel`, `planLabel`, `refundWording`, `validateRefundInput(amountCents, remainingCents, reason)`, `validateInvoiceInput`.

### 3. Screens
Route pattern: copy `src/routes/app.audit.tsx`. In live mode `beforeLoad` must NOT call `demoRepo`; it checks the signed-in viewer is an operator on the server and redirects to `/login` if not. In demo mode everything works as before.
- `/ops/restaurants` (live): search box, status filter (All, Draft, Active, Paused, Closed; the real `restaurant_status` enum values are draft, active, paused, closed), table with name, plan, status, guests, last stamp, credit balance; row opens the detail page; "Add a restaurant" button. Empty state "No restaurants match."
- `/ops/restaurants/new` (live): name, page address (slug), owner email. Uses `createRestaurantForOwner`. Refusals `slug_taken` and `slug_reserved` show their plain words next to the address field. After success go to the new restaurant's detail page.
- `/ops/restaurants/$id` (live): sections Overview (status and plan with change buttons and a required reason box, both with a confirm), Credit (balance, ledger table, "Add credit" and "Take credit away" form with amount in rand, note), Top up requests (pending ones with Confirm and Reject buttons), Invoices (list, "Create invoice" form: amount, description, due date; "Mark paid" asks for a payment reference; "Void"), Payments (list; each paid or confirmed payment has a "Record a refund" button that opens a form: amount defaults to the remaining refundable amount, reason required; a line says "This records a refund you have already paid back. It does not move money."), Activity (audit rows, plain words).
- `/ops/credit` (live): all restaurants with balances, a "Low credit" filter (balance under R100), the pending top up requests across restaurants with Confirm and Reject.
- Buttons look like buttons (class `builder-primary` or `builder-secondary`). A button never changes its label to "Saving" or "Saved"; show the result in a message line under it.
- Every amount is entered in rand and converted with the existing `randsToCents` in `src/server/live-ops.ts`. Never show cents.
- Live screens never show sample data. An empty list says so.

### 4. Demo
Demo mode keeps today's behaviour for the pages that exist. Money features (EFT confirm, invoices, refunds) are live only. State that in the handoff.

## Tests
- Real database (`src/test/db/operator-restaurants.db.test.ts`): a non-operator (owner, staff, guest, no context) is refused EVERY new function with `not_operator`; list filters and search (including a search text containing `%`); detail returns only that restaurant; confirm top up adds credit once and a second confirm is refused; reject adds none; a refund of a top up removes credit, cannot exceed the payment, cannot exceed the remaining balance, a second partial refund respects the first; refund of a monthly payment records only; void only works on open invoices; every action writes an audit row; the read functions never return guest phone numbers.
- Unit: rand to cents, refund validation wording, status and plan labels, refusal messages (no raw code ever reaches the screen).
- Component tests for the live screens with the server functions mocked: empty list, error line, success line, refusal wording, confirm dialogs.
- Migration text test as AGENTS.md requires (`set search_path`, `revoke`, `grant`, first line `assert_operator`).
- Browser test in demo mode (`tests/e2e/demo-operator.spec.ts`, new): the demo operator pages still open and their buttons still work.

## Not in this prompt
Campaign approval, enquiries, feedback, ideas, SMS outbox (D24). Operator help mode (`ops.restaurants.$id.look.tsx`). Recurring renewals and the grace period (D25).

## Handoff (send these lines)
Branch and last commit, the migration file, test counts, for each item "live done / demo done or not applicable", anything unfinished, anything that surprised you.
