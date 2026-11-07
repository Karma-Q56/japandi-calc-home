# D18: Operator console (live)

Wave 1 (start now) | Branch: `freebuff/operator-console` | Migration: 0029 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
The Patron team can run the business from the `/ops` screens using real data: see and create restaurants, pause or close them, change plans, add credit, approve campaigns, and read leads, feedback and ideas. Operators are Patron staff, so every action is logged and anything that moves money or switches a restaurant off asks for confirmation.

## You own these files (touch nothing else)
- `db/migrations/0029_operator_dev.sql`
- `src/server/live-ops.ts`, `src/server/live-ops-fns.ts`, `src/lib/live-ops.ts` and tests
- `src/routes/ops.tsx`, `ops.restaurants.tsx`, `ops.restaurants.new.tsx`, `ops.restaurants.$id.tsx`, `ops.restaurants.$id.look.tsx`, `ops.restaurants.$id.qr.tsx`, `ops.credit.tsx`, `ops.campaigns.tsx`, `ops.leads.tsx`, `ops.feedback.tsx`, `ops.ideas.tsx`, `ops.outbox.tsx`
- `src/test/db/operator.db.test.ts`

## Read first
The demo versions of every `ops.*` route, `src/domain/restaurants.ts`, `leads.ts`, `credit.ts`, `campaigns.ts`, `src/server/auth-viewer.ts` (how the operator role is recognised), migration 0013 (the pattern for functions that act with operator power), `docs/auth-setup.md`.

## Build
1. **Operator only.** Every server function checks `viewer.role === "operator"` on the server and the database function checks the login row again. There is no way to become an operator from the app: an operator login row is created by hand in the database (write the exact two lines of SQL Karma runs, in `docs/auth-setup.md`, with placeholders and no real values).
2. **Restaurants.** List all restaurants with status, plan, last activity; filters and search; detail page with owner, plan, status, locations count, credit, recent audit events. Actions through SECURITY DEFINER functions: create a restaurant on behalf of an owner email (the owner claims it when they sign up with that email), pause, resume, close, change plan (`starter`, `managed`, `partner`, `custom`), toggle "requires approval for campaigns".
3. **Credit.** Add credit and adjust credit through the existing ledger (`topup` or `adjustment`) with a required note and a unique reference so a double click cannot add twice. Show each restaurant's balance and ledger. Amounts in whole cents, shown as rands.
4. **Campaign approval.** List `pending_approval` campaigns with the full message, audience estimate and cost; approve or reject with a reason; approving writes `approved_by` and `approved_at`.
5. **Leads, feedback, ideas, outbox.** Read and mark handled, reply to feedback and ideas, with plain lists. The outbox is read only.
6. **Audit.** Every operator action writes an `audit_event` with the operator's id, the restaurant and a plain action name. Add the wording for new action names to `src/lib/live-admin.ts` only if D13a has merged; otherwise list the new action names in your handoff.
7. Demo mode keeps its current ops screens.

## Tests
- Real database: an owner, manager, staff or guest cannot call any of the functions; operator can; each action writes an audit row; adding credit twice with the same reference adds once; closing a restaurant makes its public page and join inactive; changing plan is validated; operator power is not left on after any function returns.
- Unit: plain wording, validation, error mapping.
- Text test of the migration as AGENTS.md requires.
