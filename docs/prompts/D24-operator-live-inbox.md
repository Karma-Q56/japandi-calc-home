# D24: Operator console, live (part 2: campaign approvals, enquiries, feedback, ideas, SMS outbox)

Round 8 (send with D25) | Branch: `freebuff/operator-live-b` | Migration: 0037 | Depends on: D23 merged (the operator shell and the way live operator pages are wired).

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's rules for this prompt:
- Today these five pages only work in demo mode: `src/routes/ops.campaigns.tsx`, `ops.leads.tsx`, `ops.feedback.tsx`, `ops.ideas.tsx`, `ops.outbox.tsx`. They read `demoRepo`. In live mode nobody can read the enquiries from the "Talk to us" form, the feedback, the "add my restaurant" ideas, or approve a campaign. The data lands in the database and nothing shows it. Fix that.
- Keep the demo behaviour of each page exactly as it is today, and add the live behaviour next to it. When you copy a layout from a demo page, the live page must show the same fields, filters and buttons.
- Be thorough. Every button, field, filter and refusal needs a test. No em dashes or en dashes anywhere. Plain words.
- Push only to `freebuff/operator-live-b`. Never push to main. Never touch production.

## Goal
A signed-in Patron operator, in live mode, can: approve or reject campaigns that wait for approval, work the enquiry inbox (read, set a status, add a private note), triage feedback (read, set a status, add a private note, see a screenshot), triage restaurant ideas, and see the SMS outbox (counts and failures per campaign, with phone numbers masked).

## What already exists (do not rebuild)
- `operator_decide_campaign(p_operator_id text, p_campaign_id uuid, p_decision text, p_reason text)` in `db/migrations/0029_operator_dev.sql` (approve moves `pending_approval` to `scheduled`, reject moves it to `cancelled`; a reject needs a reason of 3 to 200 characters). Server wrapper `decideCampaign` in `src/server/live-ops.ts` and server function in `src/server/live-ops-fns.ts`.
- Tables: `lead` (migrations 0001 and `0004_enquiry_inbox_dev.sql`: has `reference`, `status` enum `lead_status` = new, contacted, demo_booked, won, lost, `admin_notes`, `replied_at`, `closed_at`), `feedback` (`0006_feedback_dev.sql`, `0009_feedback_privacy_dev.sql`: status new, seen, planned, done, not_now; private `note`; optional base64 screenshot), `idea` (`0005_ideas_dev.sql`: status new, exploring, added; `admin_notes`), `campaign` and `message` (0001).
- The public forms already write these tables in live mode. There is no operator read code.
- Do not edit `src/server/live-ops.ts`. Copy its three small private helpers (`requireOperator`, `runAsOperator`, `rowsOf`) into your own file.

## You own these files (touch nothing else)
- `db/migrations/0037_operator_inbox_dev.sql` (new)
- `src/server/live-ops-inbox.ts`, `src/server/live-ops-inbox-fns.ts`, `src/lib/live-ops-inbox.ts` (new) and tests
- `src/routes/ops.campaigns.tsx`, `src/routes/ops.leads.tsx`, `src/routes/ops.feedback.tsx`, `src/routes/ops.ideas.tsx`, `src/routes/ops.outbox.tsx`
- New components under `src/components/patron/live/ops/`: `LiveOpsCampaigns.tsx`, `LiveOpsLeads.tsx`, `LiveOpsFeedback.tsx`, `LiveOpsIdeas.tsx`, `LiveOpsOutbox.tsx`
- Tests: `src/test/db/operator-inbox.db.test.ts`, `src/test/operator-inbox-migration.test.ts`, `src/lib/live-ops-inbox.test.ts`
Do not touch `ops.tsx`, `ops.restaurants*.tsx`, `ops.credit.tsx` (D23).

## Read first
`src/routes/ops.tsx`, each of the five demo pages (the live page mirrors their fields), `src/routes/app.audit.tsx` (the live or demo route pattern), `db/migrations/0004` to `0006`, `0009`, `0029`, `0026_campaigns_live_dev.sql`, `src/server/live-ops.ts`, `src/server/live-wheel.ts` (`wheelRefusalCode`, the exact-match way to read refusals from the cause chain), AGENTS.md.

## Build
### 1. Database (migration 0037)
Every function: SECURITY DEFINER, `set search_path = public, pg_temp`, first line `perform assert_operator(p_operator_id);`, save and restore `app.is_operator` exactly as `0029` does, then `revoke all ... from public; grant execute ... to app_user;`.
- Campaigns: `operator_list_campaigns(p_operator_id text, p_status text, p_limit integer)` returns `id, restaurant_id, restaurant_name, name, status, channel, message_body, audience jsonb, est_recipients, est_segments, est_cost_cents, scheduled_at, created_at, approved_by, approved_at`. `p_status` is null for "needs approval first, then the rest newest first", or one of the `campaign_status` values. Limit 1 to 200, default 50.
- Leads: `operator_list_leads(p_operator_id text, p_status text, p_search text, p_limit integer, p_offset integer)` returns the columns the demo page shows plus `reference`, `status`, `admin_notes`, `replied_at`, `closed_at`, `created_at`, `consent_at`, `visit_wanted`, `preferred_day`, `calculator`. Search matches reference, restaurant name, contact name, phone or email (`ilike`, escape `%` and `_`). `operator_update_lead(p_operator_id text, p_lead_id uuid, p_status lead_status, p_notes text) returns void`: notes up to 1000 characters (`invalid_value`), sets `replied_at = now()` the first time the status leaves `new` (when it is still null), sets `closed_at = now()` when the status becomes won or lost and clears it when it goes back to an open status, audit `lead_updated` with old and new status (never the note text). Refusal `lead_not_found`.
- Feedback: `operator_list_feedback(p_operator_id text, p_status text, p_category text, p_limit integer, p_offset integer)` returns `id, restaurant_id, restaurant_name, source, category, message, contact_ok, contact` (return `contact` ONLY when `contact_ok` is true, else null), `status, note, created_at, has_screenshot boolean, screenshot_type`. It must NOT return the screenshot data (it can be 300 KB). `operator_feedback_screenshot(p_operator_id text, p_feedback_id text)` returns the data URL and type for one row (`feedback_not_found` otherwise). `operator_update_feedback(p_operator_id text, p_feedback_id text, p_status text, p_note text) returns void`: status must be one of new, seen, planned, done, not_now (`invalid_value`), note up to 1000 characters. The private note is never visible to the sender (do not change that rule; check `0009`).
- Ideas: `operator_list_ideas(p_operator_id text, p_status text, p_limit integer)` returns `id, place, suburb, asks, note, name, status, admin_notes, created_at`; `operator_update_idea(p_operator_id text, p_idea_id text, p_status text, p_admin_notes text) returns void` (status new, exploring, added). Refusal `idea_not_found`.
- Outbox: `operator_outbox_summary(p_operator_id text, p_days integer)` returns one row per campaign that has messages in the last `p_days` days (1 to 90, default 14): campaign id, name, restaurant name, counts per `message_status` (queued, sending, sent, delivered, failed, skipped) and the most common `error_code`. `operator_outbox_messages(p_operator_id text, p_campaign_id uuid, p_status text, p_limit integer)` returns the messages with the guest's phone MASKED to country code plus the last three digits (for example `+27 *** *** 123`). Never return the full phone number, the guest name, or the message body of a restaurant's guests.
- Refusal codes you introduce: `lead_not_found`, `feedback_not_found`, `idea_not_found`, `invalid_value`. Keep `not_operator`, `campaign_not_found`, `not_pending`, `bad_decision`, `bad_reason`.

### 2. Server code
- `src/server/live-ops-inbox.ts`: `listCampaigns`, `decideCampaignLive` (call the existing `decideCampaign` from `src/server/live-ops.ts`; do not copy its SQL), `listLeads`, `updateLead`, `listFeedback`, `feedbackScreenshot`, `updateFeedback`, `listIdeas`, `updateIdea`, `outboxSummary`, `outboxMessages`. Each starts with `requireOperator(viewer)`; the operator id comes from the server session, never from the browser. Write your own `inboxRefusalCode(error)` that walks the cause chain up to 5 levels and matches the whole message exactly. Rate limit every write like `withinPaymentLimit` in `src/server/live-billing.ts`.
- `src/server/live-ops-inbox-fns.ts`: `createServerFn` wrappers with zod input (ids as strings or uuids as the SQL expects; statuses as zod enums, not free text).
- `src/lib/live-ops-inbox.ts`: pure helpers (status labels, `maskPhone`, `describeAudience(audience)` that turns the audience json into a sentence like "Guests who have not visited in 30 days", `messagePreview`, `validateNote`).

### 3. Screens
Route pattern: copy `src/routes/app.audit.tsx`. In live mode `beforeLoad` must NOT call `demoRepo`; it checks on the server that the viewer is an operator and redirects to `/login` otherwise.
- `/ops/campaigns`: "Needs approval" list first (restaurant, name, audience sentence, channel, message text in full, estimated recipients and cost in rand, scheduled time, created). Each has "Approve" and "Reject". Reject asks for a reason (3 to 200 characters) before it can be pressed. Below, "Recently decided" with status. Empty state "Nothing is waiting for approval."
- `/ops/leads` (the enquiry inbox): status filter, search box, table with reference, restaurant, contact, suburb, date, status; clicking a row opens the detail with every answer the visitor gave, the status select, a notes box and a Save button. After saving show a line "Saved." under the button; the button label never changes.
- `/ops/feedback`: filters for status and category, list with the message, source, restaurant, category, status; detail with the private note box and, when a screenshot exists, a "Show screenshot" button that loads it on demand.
- `/ops/ideas`: list sorted by number of asks, status select, notes.
- `/ops/outbox`: summary table per campaign with the counts and the top error, a days selector (7, 14, 30), click a campaign to see its messages with masked phones and a status filter. A line explains: "Phone numbers are masked on purpose."
- Buttons look like buttons (class `builder-primary` or `builder-secondary`, see `src/components/patron/kit/kit.css`). A button never changes its label to "Saving" or "Saved".
- Live screens never show sample data. Empty lists say so in plain words.

### 4. Demo
All five demo pages keep working as today. Run the existing demo e2e tests; they must still pass.

## Tests
- Real database (`src/test/db/operator-inbox.db.test.ts`): a non-operator (owner, staff, guest, no context) is refused every new function with `not_operator`; campaign list orders needs-approval first; approve and reject through the wrapper; reject without a reason refused; deciding a campaign that is not pending refused; lead list filters, search (including `%`), update sets `replied_at` once and `closed_at` for won and lost and clears it again; feedback list hides `contact` when `contact_ok` is false and never returns screenshot data; the screenshot function returns it for one row; invalid feedback status refused; idea status and notes; outbox summary counts match the message rows and a message older than the window is not counted; masked phone never contains the middle digits; a note over 1000 characters is refused.
- Unit: `maskPhone`, `describeAudience` for each audience type, note validation, status labels, no raw refusal code ever reaches a message.
- Component tests for each live page with the server functions mocked: empty state, list, filter change, error line, success line, reject needs a reason.
- Migration text test as AGENTS.md requires.
- Browser test: the five demo pages still open and their main buttons still work (`tests/e2e/demo-operator-inbox.spec.ts`, new).

## Not in this prompt
Operator help mode, replying to enquiries by email or SMS from the page (the operator replies from their own phone or email for now), exporting, charts.

## Handoff (send these lines)
Branch and last commit, the migration file, test counts, per page "live done / demo unchanged", anything unfinished, anything that surprised you.
