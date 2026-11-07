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
- `wrangler.jsonc` (only the `triggers.crons` entry)
- `src/test/db/sending.db.test.ts`

## Read first
`src/server/sms/BulkSmsProvider.ts` and its test, `src/domain/sms.ts`, `src/domain/webhooks.ts`, the three cron routes and the webhook routes (they currently answer "not implemented"), the `message` and `credit_ledger` tables, D15 (`create_campaign`) and D17 (`src/server/push/`).

## Build
1. **Cron security.** The three cron routes accept only requests with a secret header matching `CRON_SECRET` (compare in constant time). No secret configured means refuse. Read all secrets from the environment, never from code.
2. **Dispatch (every minute).** Take campaigns that are `scheduled` and due, mark them `sending` with `for update skip locked` so two runs never pick the same one. Build the real recipient list NOW: guests with valid, not withdrawn marketing consent for this restaurant, inside their weekly cap, outside quiet hours (20:00 to 08:00 Africa/Johannesburg; if now is inside quiet hours, leave the campaign scheduled). Insert `message` rows (unique per campaign, membership, channel, so a rerun cannot duplicate). Send in small batches, record `attempts`, `last_attempt_at`, provider id, errors. Retry transient failures up to 3 times with backoff; permanent failures become `failed` with the provider's code. Channel `both` sends push first and falls back to SMS only when the guest has no push subscription or push failed permanently. The SMS text ends with the restaurant's opt-out line from `docs/decisions.md` and the claim code.
3. **Webhooks.** Delivery receipts update message status and real cost (validate the provider's signature or shared secret; refuse unsigned calls; be idempotent). Inbound "STOP" (case and spacing tolerant) withdraws marketing consent for that guest at that restaurant by writing a consent event, never by deleting, and replies with a one-line confirmation.
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
