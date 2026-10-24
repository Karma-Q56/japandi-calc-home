# Decisions and verified facts

## 2026-10-16: M0 demo-only product foundation

- **User direction and milestone prompt:** build M0/M2/M3 in demo mode, with no real login, SMS provider, or database. Do not call Neon in these milestones; the existing PostgreSQL schema remains untouched.
- **Implementation:** deterministic demo seed, browser-safe `DemoRepo` with guarded localStorage and in-memory fallback, cross-tab storage listener, persisted demo clock/session, API and domain seams, role-gated demo tunnels, and a fake SMS outbox.
- **Unverified:** TypeScript, lint, unit tests, route generation/build, and mobile acceptance. Node-based checks did not return during this session; `git diff --check` passed.
- **Source of truth detail:** the M0/M2/M3 prompt files were supplied by the user; M0 requires this demo seam before later milestone screens.

## 2026-10-15: Cloudflare Workers Vite integration

- **Verified:** Cloudflare's current TanStack Start guide uses `@cloudflare/vite-plugin` together with TanStack Start's Vite plugin and React plugin, with a Wrangler config whose main entry is `@tanstack/react-start/server-entry`. The guide says to remove any other deployment adapter such as Nitro. This replaces the Lovable wrapper and prior Nitro adapter while retaining the existing routes and UI.
- **Verified:** TanStack Start supports a custom `src/server.ts` entry through `createServerEntry`, which delegates to the built-in handler. The project keeps its custom error-page normalization through that supported entry point.
- **Sources:** [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [TanStack Start server entry docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).

## 2026-10-15: Neon connection approach

- **Verified:** Neon’s serverless driver supports SQL over HTTP and WebSockets; `Pool`/`Client` provide real transactions across multiple statements, while the `neon()` HTTP function is for single-shot queries. This code uses one request-scoped WebSocket `Pool` for transaction-scoped RLS context and closes it after the transaction.
- **Sources:** [Neon serverless driver GA](https://neon.com/blog/serverless-driver-ga), [Neon driver overview](https://neon.com/docs/serverless/serverless-driver).
- **Unverified for this project:** no Neon credentials or connected account were available to apply the schema, run tenant-isolation queries, measure Johannesburg-to-Frankfurt latency, or record Cloudflare CPU time.

## 2026-10-15: Runtime database role

- **Verified:** Neon documents that login roles need a password when created. Secrets are therefore kept out of checked-in SQL: migration 0002 creates the least-privileged `app_user` role without login and grants only runtime privileges; a separate local provisioning script will enable login and set its password from `APP_USER_PASSWORD` after the role is created.
- **Unverified:** role creation/grant execution against the user's Neon project and free-plan permissions; no project was connected during this work.
- **Source:** [Neon Postgres roles](https://neon.com/blog/postgres-roles).
- **Deviation from BUILD_PLAN M0:** app role password provisioning is a separate command, not a password embedded in the migration, to keep credentials out of migrations.

## 2026-10-15: Authentication deferred

- **User direction:** defer all authentication and OTP work for now. The auth middleware is disabled; routes remain public or demo-only until a later milestone adds the specified auth model. No login flow or Better Auth dependencies were added.

## 2026-10-15: Append-only consent and private operational rows

- **Schema correction:** the supplied consent policy defaulted to `FOR ALL`, which allowed updates/deletes under RLS despite the requirement that consent evidence be insert-only. The canonical schema now has select/insert-only consent policies and the `app_user` grant revokes update/delete. Tenant-scoped audit and data-request rows are RLS-protected; leads allow public server-side inserts and operator-only reads/updates.
- **Intentional exception from the supplied schema:** `one_time_code` remains outside RLS because the SQL comments specify it is accessed before a tenant context exists. Callers must still keep access in trusted server functions and avoid returning codes or hashes to clients.

## 2026-10-15: Lint baseline

- The repository's existing sources produced more than 400 Prettier-only errors under the prior `eslint-plugin-prettier/recommended` setup. Reformatting the whole UI would create a large unrelated diff, so ESLint now checks code rules and the existing `format` script remains the explicit Prettier operation. No UI files were reformatted for M0.

## 2026-10-15: Neon access follow-up

- The user confirmed Neon is connected and authorized applying migrations. In this session the exposed Neon operations require an explicit project_id; describe_project confirmed the connection is unscoped. The available operations do not include project listing, SQL execution, or migration preparation, and the repository .env contains no DATABASE_URL/DATABASE_URL_MIGRATE entries (only existing Supabase variable names; values were not read).
- No database changes were made. Need a Neon connection that exposes list/project and migration/SQL operations, or a secure local .env configured with direct owner DATABASE_URL_MIGRATE and pooled runtime DATABASE_URL, before applying and verifying migrations. Do not paste credentials in chat.
- Per AGENTS.md, M1/M2 remain gated on M0 acceptance; this turn did not start later milestones.

## 2026-10-15: Neon CLI setup attempt

- User supplied organization org-sweet-wave-28962628, project super-waterfall-31745320, and branch production, and authorized setup. Neon CLI installation and help attempts using npx neon@latest and npm install --global neon@latest stalled without output and were interrupted. No login launched and no database changes were made.
- The provided services list included auth and optional AI/object-storage/functions. Auth remains deferred per the user's earlier explicit direction; only Postgres is in scope for M0-M2. The requested production branch is an existing live target; apply schema only after a CLI/connection is usable and the ordered migrations can be reviewed against it.

## 2026-10-17 - Review fixes to the M0/M2/M3 snapshot

- Added the missing `updateDemo` export, `Repo.update`, and the state fields `pairingCodes`, `otpSendLog`, `pinAttempts`, `pinLockouts` (typed in `src/data/types.ts`, seeded empty). `DemoRepo.reset()` now also persists, otherwise a reload restored the old data.
- Parent file routes now hand over to child routes through `withChildren()` (`src/lib/nested.tsx`). Wrappers are module-level constants because TanStack's route code-splitter failed on inline `withChildren(...)` expressions.
- `requireRole` returns true on the server (the demo session only exists in the browser); the `customerId` checks on `/me`, `/me/settings` and `/r/:slug/card` are browser-only too. `/r/:slug/join` switches the demo session to guest instead of redirecting, so a scanned QR opens the join flow. M9 replaces these with real session checks.
- Verified: member QR decodes (jsQR) to the member URL. Not verified: scanning with a phone camera, iPhone Safari, hydration warnings (React reports server/client text mismatches on pages that read demo state, because the server renders the seed and the browser renders stored state), a React warning about a state update during render on the card page.
- Known gaps: stamp slots on the card render as small dots, copy bug "7 more for Your next coffee is on us", cron and webhook route files are placeholders that do not export a Route, code style uses very long one-line functions that are hard to review.

## 2026-10-17: M0–M3 fix-up pass (this session)

- Pulled remote `125e838` ("Fix Patron demo routes and session flows") onto `freebuff/b8bfff140b08360ec8ca4786`; stashed the older local M9 harness first.
- Reward text is a noun phrase with `rewardCopy` templates (`src/lib/reward-copy.ts`); seed migrated to "a free coffee"/"a free main"; storage key bumped to `patron-demo-v4`.
- `getCard` is pure; `markCardSeen` runs in `useEffect` on the card page. `useDemoState()` (fixed seed server snapshot) added and used on card/join/me/settings/demo/control-bar.
- Demo hub tunnels are plain deep links (`/demo/as/:role?...&to=...` handled in `beforeLoad`); cron/webhook files export real `Route`s (501 POST); `_demoPlaceholder` moved to components.
- `FakeSmsProvider` uses `countSegments`; QR capacity covered by `src/lib/qr.test.ts` (20 URLs, version 5-L); privacy covered by `src/test/cross-restaurant.test.ts`.
- Verified: `npm run typecheck` clean, `npm run lint` 0 errors, `npx vitest run` 28/28, `npm run build` ok. E2E could not run here (Playwright chromium needs `libnspr4.so`, not installable in this VM).

## 2026-10-18: M6 credit ledger and SMS adapter (demo mode)

- **Ledger is the source of truth:** balance = sum(credit_ledger) in integer cents, never negative (enforced in `planEntries`, mirroring the SQL CHECK). `restaurant.creditCents` is kept in sync as a cache so the M5 dashboard and operator list keep working unchanged.
- **Duplicate migration removed:** `db/migrations/0001_initial_schema.sql` (added in cd317e1) defined the identical 23 tables + 15 enums as `0001_patron_schema.sql` (added in 783aea0, already applied), verified column-by-column before deleting, so no live database loses anything. Fresh `pnpm db:migrate` runs failed with 42710 until the file was deleted at the founder's request.
- **SMS provider comparison (researched 2026-10-18, no choice made):**
  - SMS South Africa (smssouthafrica.co.za; note smssouthafrica.com does not resolve): ~R0.29 ex VAT per SMS at 500–1,000, down to ~R0.18 at high volume; no setup/monthly fees, credits do not expire, inbound free; documented automatic STOP/DELETE/REMOVE opt-out list; DLR statuses documented for reports but no public API callback spec found; sender-ID options not verifiable from public material. Sources: [pricing](https://www.smssouthafrica.co.za/bulk-sms-pricing/), [FAQ](https://www.smssouthafrica.co.za/frequently-asked-questions/), [API overview](https://www.smssouthafrica.co.za/bulk-sms/).
  - Sendmode: R0.23 per credit at 1,000 (R230), R0.21 at 5,000; prices exclude VAT; one credit per 160 chars; REST API with access-key auth plus documented delivery-report callbacks; sender names up to 11 chars, registered/approved; STOP via shortcode 88990; replies free. Sources: [pricing](https://www.sendmode.com/pricing), [REST docs](https://developers.sendmode.com/restdocs), [delivery reports](https://developers.sendmode.com/restdocs/deliveryreports), [SA FAQ](https://www.sendmode.co.za/faq).
  - Neither publishes a separate OTP tariff; use bulk-credit rates for both until sales confirms otherwise.
  - Open question for the founder: pick smssouthafrica or sendmode (ACTION_ITEMS.md). Stub adapters throw "not configured" until then; `SMS_PROVIDER=console|fake|smssouthafrica|sendmode` (default fake).
- **Demo SMS facts:** `FakeSmsProvider` implements the SPEC 9.1 interface; webhooks are idempotent by (provider, event_id) in `provider_event`; inbound STOP withdraws marketing for that restaurant's membership only; OTP cost (R0.30, `SMS.otpCostCents`) is logged per new join.
- **EFT details on /app/credit are placeholders** (Demo Bank, 00-000-0000) pending real banking details.

## 2026-10-18: M7 campaigns (demo mode)

- **Atomic confirm:** one repo update writes the reserve entry plus one message row per eligible membership (unique campaign+membership+channel); credit re-checked inside the same operation.
- **Dispatcher is pure** (`dispatchBatch(state, now)`): claims queued rows in batches of 25, re-checks consent/erasure/caps/quiet hours per message, retries with backoff to 3 attempts then failed. Killing mid-batch and restarting sends nothing twice (claim = queued → sending in one state transition).
- **Quiet hours** 20:00–08:00 Africa/Johannesburg (SAST has no DST, so 08:00 SAST is always 06:00 UTC); scheduled sends inside the window move to 08:00.
- **Settlement:** release reservation + charge actual when nothing is queued/sending; cancel allowed in scheduled/sending; failed-after-charge gets a `refund:<message_id>` entry.
- **Attribution wording** is fixed by spec: "visits by recipients after sending; not proof the message caused them".
- **Unverified:** real-browser walkthrough of composer/results at 360/390px; Playwright cannot run in this VM.

## 2026-10-19: SMS provider: BulkSMS.com

- **Decision:** the founder uses BulkSMS.com. Adapter: `src/server/sms/BulkSmsProvider.ts` (REST v1, `POST https://api.bulksms.com/v1/messages`, Basic auth with an API token id + secret).
- **Webhooks:** BulkSMS does not sign requests. Per its webhook guide, create two webhooks (`triggerScope` SENT for status reports, RECEIVED for incoming messages), add `?secret=<SMS_WEBHOOK_SECRET>` to the URL, and make the URL return 200 to an empty `[]` POST before registering. Handlers must tolerate duplicate and out-of-order events and answer within 30 seconds. Source IPs are dynamic, so no IP allowlist.
- **Unverified (needs a live account):** terminal `status.type` values beyond DELIVERED/FAILED/SENT, whether an alphanumeric sender ID is allowed on this account and route, how inbound STOP is delivered (dedicated number vs shared route), and the credit-to-rand price. `costCents` is only set if `randPerCredit` is configured.
- **Demo build:** `SMS_PROVIDER=bulksms` still resolves to a "not configured" stub in the browser-only demo. Real sending is wired in M9 with the backend.

## 2026-10-19: Design pass (screens that looked broken)

- `.guest-step` was defined twice with different meanings (join-step panel vs a progress bar in `ui.css`), which collapsed every join step to 5px tall. The old rule is removed; the join flow, header and stepper are restyled.
- `/app/campaigns` had no outlet for its children, so `/app/campaigns/new` and `/app/campaigns/:id` rendered the list. Fixed with `withChildren`.
- The three brand fonts are now self-hosted (`@fontsource-variable/*`) so a blocked or slow Google Fonts request cannot change the look. Google Fonts remains only for other venue theme fonts.
- Overview credit shows rand, not cents. The demo pill moves above the bottom tab bars on phones.
- Stamp card: empty slots now show a ghost glyph and number, filled stamps get an ink-stamp look.
- Campaign composer: stepper, option cards, phone-bubble preview, cost tiles, back buttons.

## 2026-10-19: Neon status check (read-only) and backend plan

- **Checked via the Neon connection:** project WallStamp (`super-waterfall-31745320`, aws-eu-central-1, Postgres 18, free plan). Branches: `production` (default), `vercel-dev`, and a preview branch for this Freebuff session. The schema is applied (`patron_migrations` has 3 rows; all SPEC tables and the `restaurant_credit_balance` view exist), Neon Auth tables exist, and the `app_user` role exists, so role creation on the free plan works. Row counts: 0 restaurants, 0 customers, 0 memberships, 0 stamps, and 2 leads already captured.
- **The app itself does not read or write any of it yet.** Every screen runs on the browser-only demo repo.
- **Plan (not started, needs `DATABASE_URL` for `app_user` in `.dev.vars` and on the Worker):** (1) make the repo contract async and add a Postgres implementation next to the demo one, chosen by an env flag; (2) move slices in this order: public restaurant page, join + card, stamp (`record_stamp`), owner dashboard, credit/campaigns; (3) seed the three demo venues into a dev branch, never production; (4) switch auth on last (Neon Auth or Better Auth, passwords per the founder). Each slice keeps the demo implementation passing the same contract tests.

## 2026-10-19: Neon slices 1–3 (built, not verified against a live DB)

- **Switch:** `DATA_MODE=demo|live` (default demo) via `src/server/db/mode.ts`; `getRepos(env)` in `src/server/repos/index.ts` returns the demo or Postgres implementation. Demo behaviour is unchanged.
- **Contract:** `src/server/repos/contracts.ts` (`getPublicPage`, `submitLead`, `joinGuest`, `getCard`, `listCards`, `recordStamp`); demo adapter in `src/server/repos/demo.ts`; Postgres adapter in `src/server/repos/pg.ts` (all queries inside the existing `withContext`, one Pool per request, ≤3 round trips per call, cents + timestamptz). Server functions in `src/server/fns/{lead,restaurant,member,stamp}.ts` delegate to the repos.
- **Seed:** `npm run db:seed:dev` (`scripts/seed-dev.mjs`) writes the three venues + menu/specials to the DEV branch only; refuses production-like targets and requires `DEV_SEED_CONFIRM=yes` + `SEED_BRANCH=vercel-dev` (or preview).
- **Slice 1:** public page (restaurant/theme/hours/menu/specials) + `lead.submit` (honeypot + 5/hour rate limit via `rate_limit_hit`).
- **Slice 2:** guest join (shared phone normaliser, `consent_event` rows with wording text/version) + card + My cards. Demo OTP step kept as a marked seam; no real auth.
- **Slice 3:** staff stamping through the `record_stamp` SQL function (stamped/too_soon/duplicate_retry/reward), `audit_event` row per stamp, till PIN HMAC check (`PIN_PEPPER`, demo-pepper default marked as seam).
- **Placeholder:** the live join stores `customer.user_id` as `join:<phone>` (and the dev seed as `seed:<phone>`) because `user_id` is NOT NULL but auth does not exist yet. Replace with the real Better Auth/Neon Auth user id when the auth slice lands; the contract test pins that two joins with the same phone return the same customer.
- **Deviations/notes:** (1) SPEC.md/BUILD_PLAN.md are not in the repo, so SPEC 3.3/8 were followed from the schema comments + existing `withContext`; (2) `customer` has no public INSERT RLS policy, so the server join runs as operator inside the trusted function (never client-callable); (3) `src/domain/demo.ts` result shape is `{ok,data}/{ok,error}` while older domain callers use `.value`/`.reason`, the demo adapter accepts both shapes at runtime (pre-existing inconsistency, not changed); (4) no OTP sending, no visual changes, no production writes, no owner dashboard/credit/campaign slices.
- **Verified:** vitest 17/17 new tests pass (contract vs demo, record_stamp paths, withContext grep); Postgres contract + RLS-live tests skip without `DATABASE_URL` (dev). **Not verified:** anything against a real database (seed, live queries, RLS on dev, SQL `record_stamp`), typecheck/lint/full suite/build, see Tasks completed.md.

## 2026-10-19: Neon fixes (built, not verified against a live DB)

- **`submitLead` column/value mismatch fixed:** the live INSERT listed 14 columns but bound 13 values (missing `calculator`). Columns now come from exported `LEAD_COLUMNS` with `leadValues()` + `renderLeadInsertSql()` and a count test; `notes` added as a 15th column (the lead form has an "Anything else?" field).
- **Till PIN hardened:** empty/undefined/non-4-digit PIN throws "PIN required" before any DB work; no demo-pepper fallback (missing `PIN_PEPPER` throws); `timingSafeEqual` compare; 5 wrong PINs in 10 min locks the staff member for 15 min via `rate_limit_hit`, locked attempts return the same "Wrong PIN." and are not recorded so the lock expires. Success path stays at 3 round trips (staff+fails in one query, `record_stamp`, audit).
- **Seed rewritten:** one tx with `app.is_operator`, real guard (`PROD_DB_HOST` hostname comparison + `DEV_SEED_CONFIRM=yes` + dev `SEED_BRANCH`), full themes/hours/60 guests/memberships/consents/stamps/rewards/staff/ledger topups mirrored from `src/data/seed.ts`. Guard refusals verified (exit 1, no connection opened).
- **Live UI path:** `src/server/live.ts` (`createServerFn`; `isOperator: false` hard-coded server-side, never from client input; lead IP hashed server-side) wired into `/r/:slug`, join, card (search `customerId` pre-auth seam), till stamp (PIN field = per-stamp till PIN in live mode) and `LeadForm`. Demo default unchanged; staff/card `beforeLoad` demo-session redirects skipped only in live mode.
- **Verified:** typecheck clean, lint 0 errors, vitest 126/126 runnable pass (5 live-DB tests skip), build ok. **Not verified:** everything against a real dev database.

## 2026-10-21: Phase C engagement, messaging, and responsive fixes

- **Timezone:** public venue hours use one supplied instant and `Africa/Johannesburg` for both weekday and open status; campaign weekday segments and daily-spin availability use the venue calendar day.
- **Public pages and brand:** venue pages support compact/full hours, uploaded cover imagery with a palette-based fallback, restored product/venue wordmarks, and improved mobile layouts.
- **Messaging and preferences:** added push subscription opt-in/out UI, push-aware campaign channels and demo outbox records, copy/quiet-hour/cost and dispatch handling, plus campaign composition for push and push-with-SMS fallback. No live push provider is configured; delivery remains demo-only.
- **Customers and audiences:** supports matching customer membership IDs for selection, saved-list membership removal, emptying an existing saved list, and customer-list selection workflows.
- **Spin modes:** earned visit/milestone spins, reward-decider spins and daily Johannesburg surprise spins are represented in owner configuration and guest UI; daily surprises issue personal codes from active specials. These remain demo-repository backed and are not a persisted live-DB feature.
- **Verification (local working tree, 2026-10-22):** `pnpm typecheck` passed; `pnpm lint` exited 0 with 11 existing warnings; full `pnpm exec vitest run` passed 161 tests with 5 skipped (live DB tests); `pnpm build` succeeded. The threads worker timed out starting `src/test/route-children.test.tsx` on the first full run; the file passed when run alone. Browser checks at 375px and 1280px measured DOM layout (no screenshots): landing, `/for-diners`, `/login`, `/demo` owner entry, owner overview, `/app/customers` (20 guests), `/app/campaigns/new`, `/app/loyalty` and `/me/settings` have no horizontal page overflow, and the owner sidebar/tab-bar switch at the two widths. `/r/:slug` could not be exercised locally because `.dev.vars` selects `DATA_MODE=live` and its database is unreachable (500); the demo composer logs a hydration mismatch since demo session state is browser-only. External provider, authentication, live database and staging behavior remain unverified.
- **No external actions:** no provider account was created, no production database was modified, and no deployment was performed.

## 2026-10-19: Phone verification (OTP) gate on live join

- **No real phone verification exists yet.** `joinGuestFn` (`src/server/live.ts`) no longer hard-codes `otpVerified: true`.
- Joins stay disabled unless `DEMO_OTP_BYPASS=true` (default false). When disabled and no OTP check exists, the function returns `{ ok: false, message: "Phone verification is not enabled yet." }` instead of creating a membership.
- Set `DEMO_OTP_BYPASS=true` only for local demo testing against a dev database. The auth slice replaces this gate with a real OTP check.

## 2026-10-23: Wheel modes, reward floor, and campaign panels

- **Welcome vs earned spins:** the welcome spin is a separate mode (`join`) from the visit-earned wheel. The original mode id `welcome` is kept as the legacy name for earned spins and normalised on read and save, so local snapshots written before this change keep their wheel.
- **Reward decider is server-only:** the house draws uniformly from the owner's prize segments whose `valueCents` is at or above `spin.rewardFloorCents` (the value the owner attaches to the advertised card reward). The draw ignores any segment passed by a caller, never selects a "try again" segment, and leaves the advertised reward untouched (with `keptAdvertisedReward: true`) when no segment qualifies, so the outcome can never be worse than the card promised.
- **Bonus stamps:** `SpinSegment.bonusStamps` lets a wheel prize pay stamps instead of an offer; stamps go through `grantStampEvents` with a `spin:<spinId>` key, so a retried request cannot pay twice. The spin config stays in the existing JSONB `spin` column, so no migration was needed.
- **Dashboard campaign split:** a campaign name belongs in body text, not in a stat card's display value, so the overview's campaign stat became a "Campaigns sent" count and the next/last campaign details moved into their own panels with status, date and links.

## 2026-10-23: One marketing site, demo hub removal, hardened demo storage

- **Navigation:** one `MarketingShell` owns the header and footer for every marketing page, and the active state comes from the router path, so pages cannot drift apart. "For businesses" is a native `<details>` disclosure, a dropdown on desktop and an accordion inside the mobile menu, so it needs no menu library and keeps working before hydration.
- **Information architecture:** home is diner-first, with the owner marketing moved to `/for-business`; the two funnels stay separate but cross-link. The diner search filters the seeded venues in the browser because there is no public venue index endpoint; `VenueSearch`/`VenueGrid` take a `venues` prop for when one exists.
- **Demo surface:** `/demo` survives only as a parent route that redirects to `/` and passes `/demo/status` and `/demo/outbox` through. Role switching moved to the unlinked `/dev/roles`, which shares `signInAsDemoAccount` with `/login` and still accepts the milestone deep links. Product guards redirect to `/login`, not `/demo`.
- **Demo storage:** snapshots are versioned by key (`patron-demo-v7`) and migrated from `patron-demo-v1…v6`; a snapshot is only accepted when its version, required collections, restaurant identity and membership/session references hold, and it is rewritten under the current key afterwards. Anything unreadable is discarded and reseeded. The card route also has an error boundary, because a stale snapshot previously surfaced as a blank page.
- **Verified:** typecheck, lint (0 errors, 11 pre-existing warnings), 172 tests / 5 live-DB skips, build, and a demo-mode browser pass (22 viewport audits plus the login → card flow).
- **Unverified:** real sign-in/OAuth, live venue search, and pilot case-study numbers.
