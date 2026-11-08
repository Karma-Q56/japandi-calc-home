# D16: Sending (SMS and push), delivery reports, STOP replies, cost settling

Wave 3 (start after D15 and D17 are merged) | Branch: `freebuff/sending` | Migration: 0027 | Depends on: D15, D17

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
A scheduled campaign is really delivered, on time, once, to the right people, and the money is settled to the cent. You cannot send real messages from here (no secrets, no network), so everything is built against the console provider and a mocked BulkSMS, and Karma does the one real test later with a small credit.

## You own these files (touch nothing else)
- `db/migrations/0027_sending_dev.sql`
- `src/server/sms/*` (register the BulkSMS provider, which exists but is not registered), `src/server/live-dispatch.ts`, `src/server/live-settle.ts`, `src/lib/live-dispatch.ts` and tests
- `src/routes/api/cron/dispatch.tsx`, `settle.tsx`, `nightly.tsx`, `src/routes/api/webhooks/sms/*`
- `src/routes/app.campaigns.new.tsx` (only: enable the Push and Both channel choices, using D17's reach count)
- `wrangler.jsonc` (only `triggers.crons`, and `main` if you add a custom Worker entry), `src/worker-entry.ts` (new, only if needed, see step 1)
- `src/test/db/sending.db.test.ts`

## Read first
`src/server/sms/BulkSmsProvider.ts` and its test, `src/domain/campaigns.ts` (the sending rules and constants are the specification), `src/domain/sms.ts`, `src/domain/webhooks.ts`, the three cron routes and `src/routes/api/webhooks/sms/$provider.tsx` (they currently answer "not implemented"), the `consent_event` table, the `message` and `credit_ledger` tables, D15 (`create_campaign`) and D17 (`src/server/push/`).

## Build
1. **Cron.** Cloudflare cron triggers call a Worker `scheduled()` function, not an HTTP route, and the TanStack Start server entry only exports `fetch`. Add a small custom Worker entry that re-exports the app's `fetch` and adds `scheduled(event, env, ctx)`, which calls the three cron routes with the `x-cron-secret` header (check the TanStack Start documentation for custom server entries before you write it, and point `main` in `wrangler.jsonc` at it). Add `triggers.crons` for dispatch (every minute), settle (every 10 minutes) and nightly. If a custom entry turns out not to work with the build, stop and say so in the handoff with the fallback: an external scheduler (a scheduled GitHub Actions workflow) calling the same HTTP routes with the secret. The three cron routes today accept a request when no secret is configured. Change that: no `CRON_SECRET` configured means refuse, and compare the header in constant time (`safeEqual` in `BulkSmsProvider.ts`).
2. **Dispatch (every minute).** Take campaigns that are `scheduled` and due, mark them `sending` with `for update skip locked` so two runs never pick the same one. Build the real recipient list NOW: guests with valid, not withdrawn marketing consent for this restaurant, inside the restaurant's `member_weekly_cap` (messages one guest may receive in 7 days, counted from `message` rows), outside quiet hours (`inQuietHours` and `QUIET_HOURS` from the demo code; if now is inside quiet hours, leave the campaign scheduled until 08:00). Insert `message` rows (unique per campaign, membership, channel, so a rerun cannot duplicate). Send in batches of `DISPATCH_BATCH`, record `attempts`, `last_attempt_at`, provider id, errors. Retry transient failures up to `MAX_ATTEMPTS` times with backoff; permanent failures become `failed` with the provider's code. Channel `both` sends push first and falls back to SMS only when the guest has no push subscription or push failed permanently. The SMS text ends with `STOP_FOOTER` from `src/domain/campaigns.ts`, and the claim code.
3. **Webhooks.** Delivery receipts update message status and real cost (validate the provider's signature or shared secret; refuse unsigned calls; be idempotent). Inbound "STOP" (case and spacing tolerant) withdraws marketing consent for that guest at that restaurant by writing a `consent_event`, never by deleting, and replies with a one-line confirmation.
4. **Settle (every 10 minutes).** For campaigns whose messages are all final: post a `charge` for the actual cost and a `release` for the unused reserve, with references `charge:<campaign>` and `release:<campaign>` so reruns do nothing. Mark the campaign `sent`, or `failed` when nothing was delivered. A campaign that would cost more than its reserve is capped at the reserve and the rest is not sent.
5. **Alerts.** A nightly job records an audit event and an owner notice when available credit is below R50.
6. **Provider choice** comes from `SMS_PROVIDER` (`console` or `bulksms`). With no credentials the BulkSMS provider refuses to send rather than pretending.
7. **Push channel in the campaign form.** Enable the Push and Both options in the new campaign screen, showing how many guests can receive push (D17).

## Tests
- Real database: a due campaign is picked once under two concurrent dispatchers; recipients exclude withdrawn, non-consenting and over-cap guests; quiet hours defer; rerunning dispatch sends nothing twice; STOP withdraws and later campaigns skip that guest; settle posts charge and release once under retry and the ledger sums to the reserve; B cannot affect A's campaigns; cron routes refuse without the secret.
- Unit (mocked provider): batching, retry and backoff, fallback from push to SMS, signature check, STOP variants, opt-out line present.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
A real send. Karma runs one real test after secrets are set.
