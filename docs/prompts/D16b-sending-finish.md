# D16b: Finish sending: push channel, low-credit alert, Worker cron, STOP reply, missing tests

Follow-up to D16 | Branch: `freebuff/sending-finish` | Migration: `0033_sending_finish_dev.sql` only if needed | Depends on: D16 (merged and reviewed)

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Why this exists
D16 was merged with the core of sending working (due campaigns are claimed once, the real audience is queued, SMS goes out in batches, delivery receipts and STOP are handled, and settle posts one charge and one release). Claude fixed several money and safety bugs in review (audience filter, charge sign, settle references, cron secret). These parts of the D16 prompt (`docs/prompts/D16-sending.md`) were not built. Read that prompt for the detail, open the existing files, and finish only what is missing. Do not change how settle or the audience queue work unless a test proves a bug.

## You own these files (touch nothing else)
- `db/migrations/0033_sending_finish_dev.sql` (only if needed)
- `src/server/live-dispatch.ts`, `src/server/live-settle.ts`, `src/lib/live-dispatch.ts` and tests, `src/server/sms/*`, `src/server/push/*` (call it, do not rewrite it)
- `src/routes/api/cron/*`, `src/routes/api/webhooks/sms/*`
- `src/routes/app.campaigns.new.tsx` (only the Push and Both channel choices)
- `wrangler.jsonc` (only `triggers.crons`, and `main`), `src/worker-entry.ts` (new)
- `src/test/db/sending.db.test.ts` (new), `src/test/db/sending-flow.db.test.ts` (extend, do not delete cases)

## Build
1. **Push channel and "Both".** Enable Push and Both in the new campaign screen, showing how many guests can receive push (D17's reach count). In dispatch, "Both" sends push first and falls back to SMS only when the guest has no push subscription or push failed permanently. Push-only never falls back. Cost estimate for push is zero. The reserve for "Both" is the SMS worst case.
2. **Nightly low-credit alert.** `src/routes/api/cron/nightly.tsx` records an audit event and an owner notice when a restaurant's available credit is below R50 (5000 cents). Once per restaurant per day (idempotent). Use the same available balance rule as the credit screen.
3. **Worker `scheduled()` entry.** Add `src/worker-entry.ts` that re-exports the app's `fetch` and adds `scheduled(event, env, ctx)`, which calls the three cron routes with the `x-cron-secret` header, and add `triggers.crons` (dispatch every minute, settle every 10 minutes, nightly once a day). Check the TanStack Start documentation for custom server entries first. If it does not work with the build, stop and say so in the handoff; the fallback today is the GitHub Actions workflow `.github/workflows/cron.yml`, which stays off until Karma sets the repository variable `CRON_ENABLED` to `true`.
4. **STOP confirmation reply.** After an inbound STOP is recorded, reply with one short line ("You are unsubscribed from <restaurant name>. You will not get any more messages from them.") through the provider. A reply failure must never undo the opt-out.
5. **Delivery receipt race.** A receipt can arrive before `finish_message_send` has stored the provider id, and today that receipt is lost. Fix it by keeping unmatched receipts for a short time (a small table, 24 hours) and applying them when the provider id is recorded, or by recording the provider id before the send call returns. Pick the simplest, and test it.
6. **Tests that the D16 prompt asked for and are missing:** webhook signature check (unsigned and wrong secret are refused, constant-time compare), receipt idempotency (the same receipt twice changes nothing), STOP wording variants (case, spacing, "stop.", "STOP ALL"), push to SMS fallback, two concurrent dispatchers claim a campaign once, quiet hours defer to 08:00 SAST, cron routes refuse without the secret, and one restaurant can never affect another restaurant's messages.

## Not in this phase
A real send (Karma runs one real test with a small credit after the secrets are set), the operator console, plans and payments.

## Handoff
List what you finished, what you could not prove, and any decision you made.
