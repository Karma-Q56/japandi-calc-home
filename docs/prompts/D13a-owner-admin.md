# D13a: Settings, Activity log, Feedback and Ideas (live)

Wave 1 (start now) | Branch: `freebuff/owner-admin` | Migration: 0022 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Four owner screens stop showing sample data and start using the real database: Settings, Activity log, Feedback and Ideas.

## You own these files (touch nothing else)
- `db/migrations/0022_owner_admin_dev.sql`
- `src/server/live-admin.ts`, `src/server/live-admin-fns.ts`, `src/lib/live-admin.ts` and tests
- `src/routes/app.settings.tsx`, `src/routes/app.audit.tsx`, `src/routes/app.feedback.tsx`, `src/routes/app.ideas.tsx`
- `src/test/db/owner-admin.db.test.ts`

## Read first (the specification)
The four demo screens, `src/domain/audit.ts`, `feedback.ts`, `ideas.ts`, `help.ts`, and the `audit_event`, `feedback` and `idea` tables (migrations 0001, 0005, 0006). Note the app role is append-only on audit rows.

## Build
1. **Settings.** Port each section of the demo Settings page to live wherever it has a real effect, using columns that already exist (message weekly caps, quiet hours) and adding the missing ones in 0022 with check constraints: business details (name, phone, address, suburb, city), who gets enquiries, message limits, offers and alerts preferences, "Help from Patron" mode, and "Orders at the till" (`orders_at_till boolean not null default false`; D13c reads it, you only own the switch). A section that cannot work yet (for example done-for-you campaign requests) saves a request row an operator can read (reuse `lead` or `feedback`) and says so plainly. Only owners and managers save. Changing the business name or phone writes an audit row.
2. **Activity log.** Read-only list of this restaurant's `audit_event` rows, newest first, 50 per page, with plain wording per action (for example "Sipho changed the reward", "You published your restaurant"). Never show raw ids, IPs or internal codes. Add wording for every action name that exists in the migrations and functions so far, with a safe fallback sentence.
3. **Feedback and Ideas.** Owners send feedback and ideas for Patron, see their own past submissions and any reply, and vote on ideas as the demo does. Rate limit sending (bucket `feedback-send`, 10 per day).
4. Demo mode keeps its current behaviour on all four screens.

## Tests
- Real database: settings saved by the owner of A are invisible and unchangeable by B; staff and guests cannot save; invalid values refused; every saved change writes an audit row; the activity log shows only A's rows; feedback and ideas are private to the restaurant except where the demo shares them; no update or delete on audit rows.
- Unit: audit wording for every known action, validation, error mapping.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
Your page, card design and logo (D13b), the publish checklist (D10), message sending (D15 and D16).
