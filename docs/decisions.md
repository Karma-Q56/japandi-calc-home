# Decisions and verified facts

## 2026-10-16 — M0 demo-only product foundation

- **User direction and milestone prompt:** build M0/M2/M3 in demo mode, with no real login, SMS provider, or database. Do not call Neon in these milestones; the existing PostgreSQL schema remains untouched.
- **Implementation:** deterministic demo seed, browser-safe `DemoRepo` with guarded localStorage and in-memory fallback, cross-tab storage listener, persisted demo clock/session, API and domain seams, role-gated demo tunnels, and a fake SMS outbox.
- **Unverified:** TypeScript, lint, unit tests, route generation/build, and mobile acceptance. Node-based checks did not return during this session; `git diff --check` passed.
- **Source of truth detail:** the M0/M2/M3 prompt files were supplied by the user; M0 requires this demo seam before later milestone screens.

## 2026-10-15 — Cloudflare Workers Vite integration

- **Verified:** Cloudflare's current TanStack Start guide uses `@cloudflare/vite-plugin` together with TanStack Start's Vite plugin and React plugin, with a Wrangler config whose main entry is `@tanstack/react-start/server-entry`. The guide says to remove any other deployment adapter such as Nitro. This replaces the Lovable wrapper and prior Nitro adapter while retaining the existing routes and UI.
- **Verified:** TanStack Start supports a custom `src/server.ts` entry through `createServerEntry`, which delegates to the built-in handler. The project keeps its custom error-page normalization through that supported entry point.
- **Sources:** [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [TanStack Start server entry docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).

## 2026-10-15 — Neon connection approach

- **Verified:** Neon’s serverless driver supports SQL over HTTP and WebSockets; `Pool`/`Client` provide real transactions across multiple statements, while the `neon()` HTTP function is for single-shot queries. This code uses one request-scoped WebSocket `Pool` for transaction-scoped RLS context and closes it after the transaction.
- **Sources:** [Neon serverless driver GA](https://neon.com/blog/serverless-driver-ga), [Neon driver overview](https://neon.com/docs/serverless/serverless-driver).
- **Unverified for this project:** no Neon credentials or connected account were available to apply the schema, run tenant-isolation queries, measure Johannesburg-to-Frankfurt latency, or record Cloudflare CPU time.

## 2026-10-15 — Runtime database role

- **Verified:** Neon documents that login roles need a password when created. Secrets are therefore kept out of checked-in SQL: migration 0002 creates the least-privileged `app_user` role without login and grants only runtime privileges; a separate local provisioning script will enable login and set its password from `APP_USER_PASSWORD` after the role is created.
- **Unverified:** role creation/grant execution against the user's Neon project and free-plan permissions; no project was connected during this work.
- **Source:** [Neon Postgres roles](https://neon.com/blog/postgres-roles).
- **Deviation from BUILD_PLAN M0:** app role password provisioning is a separate command, not a password embedded in the migration, to keep credentials out of migrations.

## 2026-10-15 — Authentication deferred

- **User direction:** defer all authentication and OTP work for now. The auth middleware is disabled; routes remain public or demo-only until a later milestone adds the specified auth model. No login flow or Better Auth dependencies were added.

## 2026-10-15 — Append-only consent and private operational rows

- **Schema correction:** the supplied consent policy defaulted to `FOR ALL`, which allowed updates/deletes under RLS despite the requirement that consent evidence be insert-only. The canonical schema now has select/insert-only consent policies and the `app_user` grant revokes update/delete. Tenant-scoped audit and data-request rows are RLS-protected; leads allow public server-side inserts and operator-only reads/updates.
- **Intentional exception from the supplied schema:** `one_time_code` remains outside RLS because the SQL comments specify it is accessed before a tenant context exists. Callers must still keep access in trusted server functions and avoid returning codes or hashes to clients.

## 2026-10-15 — Lint baseline

- The repository's existing sources produced more than 400 Prettier-only errors under the prior `eslint-plugin-prettier/recommended` setup. Reformatting the whole UI would create a large unrelated diff, so ESLint now checks code rules and the existing `format` script remains the explicit Prettier operation. No UI files were reformatted for M0.

## 2026-10-15 — Neon access follow-up

- The user confirmed Neon is connected and authorized applying migrations. In this session the exposed Neon operations require an explicit project_id; describe_project confirmed the connection is unscoped. The available operations do not include project listing, SQL execution, or migration preparation, and the repository .env contains no DATABASE_URL/DATABASE_URL_MIGRATE entries (only existing Supabase variable names; values were not read).
- No database changes were made. Need a Neon connection that exposes list/project and migration/SQL operations, or a secure local .env configured with direct owner DATABASE_URL_MIGRATE and pooled runtime DATABASE_URL, before applying and verifying migrations. Do not paste credentials in chat.
- Per AGENTS.md, M1/M2 remain gated on M0 acceptance; this turn did not start later milestones.

## 2026-10-15 — Neon CLI setup attempt

- User supplied organization org-sweet-wave-28962628, project super-waterfall-31745320, and branch production, and authorized setup. Neon CLI installation and help attempts using npx neon@latest and npm install --global neon@latest stalled without output and were interrupted. No login launched and no database changes were made.
- The provided services list included auth and optional AI/object-storage/functions. Auth remains deferred per the user's earlier explicit direction; only Postgres is in scope for M0-M2. The requested production branch is an existing live target; apply schema only after a CLI/connection is usable and the ordered migrations can be reviewed against it.

## 2026-10-17 - Review fixes to the M0/M2/M3 snapshot

- Added the missing `updateDemo` export, `Repo.update`, and the state fields `pairingCodes`, `otpSendLog`, `pinAttempts`, `pinLockouts` (typed in `src/data/types.ts`, seeded empty). `DemoRepo.reset()` now also persists, otherwise a reload restored the old data.
- Parent file routes now hand over to child routes through `withChildren()` (`src/lib/nested.tsx`). Wrappers are module-level constants because TanStack's route code-splitter failed on inline `withChildren(...)` expressions.
- `requireRole` returns true on the server (the demo session only exists in the browser); the `customerId` checks on `/me`, `/me/settings` and `/r/:slug/card` are browser-only too. `/r/:slug/join` switches the demo session to guest instead of redirecting, so a scanned QR opens the join flow. M9 replaces these with real session checks.
- Verified: member QR decodes (jsQR) to the member URL. Not verified: scanning with a phone camera, iPhone Safari, hydration warnings (React reports server/client text mismatches on pages that read demo state, because the server renders the seed and the browser renders stored state), a React warning about a state update during render on the card page.
- Known gaps: stamp slots on the card render as small dots, copy bug "7 more for Your next coffee is on us", cron and webhook route files are placeholders that do not export a Route, code style uses very long one-line functions that are hard to review.

## 2026-10-17 — M0–M3 fix-up pass (this session)

- Pulled remote `125e838` ("Fix Patron demo routes and session flows") onto `freebuff/b8bfff140b08360ec8ca4786`; stashed the older local M9 harness first.
- Reward text is a noun phrase with `rewardCopy` templates (`src/lib/reward-copy.ts`); seed migrated to "a free coffee"/"a free main"; storage key bumped to `patron-demo-v4`.
- `getCard` is pure; `markCardSeen` runs in `useEffect` on the card page. `useDemoState()` (fixed seed server snapshot) added and used on card/join/me/settings/demo/control-bar.
- Demo hub tunnels are plain deep links (`/demo/as/:role?...&to=...` handled in `beforeLoad`); cron/webhook files export real `Route`s (501 POST); `_demoPlaceholder` moved to components.
- `FakeSmsProvider` uses `countSegments`; QR capacity covered by `src/lib/qr.test.ts` (20 URLs, version 5-L); privacy covered by `src/test/cross-restaurant.test.ts`.
- Verified: `npm run typecheck` clean, `npm run lint` 0 errors, `npx vitest run` 28/28, `npm run build` ok. E2E could not run here (Playwright chromium needs `libnspr4.so`, not installable in this VM).

## 2026-10-18 — M6 credit ledger and SMS adapter (demo mode)

- **Ledger is the source of truth:** balance = sum(credit_ledger) in integer cents, never negative (enforced in `planEntries`, mirroring the SQL CHECK). `restaurant.creditCents` is kept in sync as a cache so the M5 dashboard and operator list keep working unchanged.
- **Duplicate migration removed:** `db/migrations/0001_initial_schema.sql` (added in cd317e1) defined the identical 23 tables + 15 enums as `0001_patron_schema.sql` (added in 783aea0, already applied) — verified column-by-column before deleting, so no live database loses anything. Fresh `pnpm db:migrate` runs failed with 42710 until the file was deleted at the founder's request.
- **SMS provider comparison (researched 2026-10-18, no choice made):**
  - SMS South Africa (smssouthafrica.co.za; note smssouthafrica.com does not resolve): ~R0.29 ex VAT per SMS at 500–1,000, down to ~R0.18 at high volume; no setup/monthly fees, credits do not expire, inbound free; documented automatic STOP/DELETE/REMOVE opt-out list; DLR statuses documented for reports but no public API callback spec found; sender-ID options not verifiable from public material. Sources: [pricing](https://www.smssouthafrica.co.za/bulk-sms-pricing/), [FAQ](https://www.smssouthafrica.co.za/frequently-asked-questions/), [API overview](https://www.smssouthafrica.co.za/bulk-sms/).
  - Sendmode: R0.23 per credit at 1,000 (R230), R0.21 at 5,000; prices exclude VAT; one credit per 160 chars; REST API with access-key auth plus documented delivery-report callbacks; sender names up to 11 chars, registered/approved; STOP via shortcode 88990; replies free. Sources: [pricing](https://www.sendmode.com/pricing), [REST docs](https://developers.sendmode.com/restdocs), [delivery reports](https://developers.sendmode.com/restdocs/deliveryreports), [SA FAQ](https://www.sendmode.co.za/faq).
  - Neither publishes a separate OTP tariff; use bulk-credit rates for both until sales confirms otherwise.
  - Open question for the founder: pick smssouthafrica or sendmode (ACTION_ITEMS.md). Stub adapters throw "not configured" until then; `SMS_PROVIDER=console|fake|smssouthafrica|sendmode` (default fake).
- **Demo SMS facts:** `FakeSmsProvider` implements the SPEC 9.1 interface; webhooks are idempotent by (provider, event_id) in `provider_event`; inbound STOP withdraws marketing for that restaurant's membership only; OTP cost (R0.30, `SMS.otpCostCents`) is logged per new join.
- **EFT details on /app/credit are placeholders** (Demo Bank, 00-000-0000) pending real banking details.

## 2026-10-18 — M7 campaigns (demo mode)

- **Atomic confirm:** one repo update writes the reserve entry plus one message row per eligible membership (unique campaign+membership+channel); credit re-checked inside the same operation.
- **Dispatcher is pure** (`dispatchBatch(state, now)`): claims queued rows in batches of 25, re-checks consent/erasure/caps/quiet hours per message, retries with backoff to 3 attempts then failed. Killing mid-batch and restarting sends nothing twice (claim = queued → sending in one state transition).
- **Quiet hours** 20:00–08:00 Africa/Johannesburg (SAST has no DST, so 08:00 SAST is always 06:00 UTC); scheduled sends inside the window move to 08:00.
- **Settlement:** release reservation + charge actual when nothing is queued/sending; cancel allowed in scheduled/sending; failed-after-charge gets a `refund:<message_id>` entry.
- **Attribution wording** is fixed by spec: "visits by recipients after sending; not proof the message caused them".
- **Unverified:** real-browser walkthrough of composer/results at 360/390px; Playwright cannot run in this VM.

## 2026-10-19 — SMS provider: BulkSMS.com

- **Decision:** the founder uses BulkSMS.com. Adapter: `src/server/sms/BulkSmsProvider.ts` (REST v1, `POST https://api.bulksms.com/v1/messages`, Basic auth with an API token id + secret).
- **Webhooks:** BulkSMS does not sign requests. Per its webhook guide, create two webhooks (`triggerScope` SENT for status reports, RECEIVED for incoming messages), add `?secret=<SMS_WEBHOOK_SECRET>` to the URL, and make the URL return 200 to an empty `[]` POST before registering. Handlers must tolerate duplicate and out-of-order events and answer within 30 seconds. Source IPs are dynamic, so no IP allowlist.
- **Unverified (needs a live account):** terminal `status.type` values beyond DELIVERED/FAILED/SENT, whether an alphanumeric sender ID is allowed on this account and route, how inbound STOP is delivered (dedicated number vs shared route), and the credit-to-rand price. `costCents` is only set if `randPerCredit` is configured.
- **Demo build:** `SMS_PROVIDER=bulksms` still resolves to a "not configured" stub in the browser-only demo. Real sending is wired in M9 with the backend.

## 2026-10-19 — Design pass (screens that looked broken)

- `.guest-step` was defined twice with different meanings (join-step panel vs a progress bar in `ui.css`), which collapsed every join step to 5px tall. The old rule is removed; the join flow, header and stepper are restyled.
- `/app/campaigns` had no outlet for its children, so `/app/campaigns/new` and `/app/campaigns/:id` rendered the list. Fixed with `withChildren`.
- The three brand fonts are now self-hosted (`@fontsource-variable/*`) so a blocked or slow Google Fonts request cannot change the look. Google Fonts remains only for other venue theme fonts.
- Overview credit shows rand, not cents. The demo pill moves above the bottom tab bars on phones.
- Stamp card: empty slots now show a ghost glyph and number, filled stamps get an ink-stamp look.
- Campaign composer: stepper, option cards, phone-bubble preview, cost tiles, back buttons.
