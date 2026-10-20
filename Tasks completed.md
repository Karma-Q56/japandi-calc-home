# Patron task status

> Review 2026-10-17: the snapshot received did not typecheck or build (missing `updateDemo`, missing state fields), and nested pages (`/r/:slug/join`, `/r/:slug/card`, `/me/settings`, `/app/menu`, `/app/qr`, `/ops/restaurants/new` and others) rendered their parent page because parents had no outlet. Role guards also redirected every reload and QR scan to `/demo` because the server cannot read the demo session. All fixed (see docs/decisions.md). Verified by hand in a 390 px browser: demo hub, guest join to card, My cards, operator wizard creating a restaurant and its public page, owner menu and QR print pack, member QR decodes with a real reader. Still placeholders: staff till (M4), owner dashboard (M5), credit (M6), campaigns (M7), PWA/push (M8), M9.

Updated 2026-10-16. Work is on `vibe/m1-m3-implementation-ab5f40`, based on the latest fetched Patron branch requested earlier. Authentication remains skipped. The current app is a browser-only demo backed by local storage and seeded data.

## Design and fix pass (2026-10-19, reviewed in a real browser at 390 and 1280 px)

- [x] verified (browser) Join flow was collapsed to 5px-tall rows because `.guest-step` meant two things in `ui.css`; old rule removed, join header/stepper/consent rows restyled.
- [x] verified (browser) `/app/campaigns/new` and `/app/campaigns/:id` showed the campaigns list (no outlet). Fixed with `withChildren`. Full compose flow walked through: audience, message, cost, confirm, results.
- [x] verified (browser) Campaign composer redesigned: stepper, option cards, phone-bubble preview, cost tiles, back buttons.
- [x] verified (browser) Stamp card: ghost glyph + number in empty slots, ink-stamp look for filled ones; homepage stamp bar still fills on scroll (0/8 -> 5/8 -> 8/8).
- [x] verified Brand fonts self-hosted (`@fontsource-variable/*`); Overview credit shows rand; demo pill moved above bottom tab bars.
- [x] verified (vitest 101/101, typecheck clean, lint 0 errors, build ok) BulkSMS.com adapter `src/server/sms/BulkSmsProvider.ts` with tests; not yet run against a real account.
- [x] verified (browser) Operator restaurant table has Look & feel / View page / QR actions per row.
- [x] verified (browser) Till: dotted PIN field, lookup form (Enter works), member progress, styled success/error toasts, full-width till bar. My cards: greeting, summary chips, reward badge.
- [x] verified (read-only Neon check) Schema is applied on Neon production; app_user role exists; 2 leads captured; app not yet connected (see decisions.md).
- [ ] Not verified: iPhone Safari, phone-camera QR scan, real SMS send, Neon (the app is still demo-only and never touches the database).

How to run: `npm install` then `npm run dev` and open http://localhost:5173/demo. Note: the dev server needs about 450 MB; kill old `vite dev` processes before starting a new one, otherwise the machine runs out of memory and the site shows "can't be reached".

## M0 — Demo foundation

### Implemented; verification not completed

- [x] Schema-shaped demo models, repository contract and deterministic seed data for three venues, 60 fictional guests, 61 memberships, stamp events, rewards, campaigns, ledger, menus, specials and message outbox.
- [x] Versioned local-storage repository with guarded access, in-memory fallback, reset and cross-tab storage synchronization.
- [x] Shared demo clock and role session; role-aware demo hub and floating controls.
- [x] Typed API result helpers, restaurant/member service seams, fake SMS provider, simulated delivery receipts and STOP handling.
- [x] Kept direct `localStorage` use inside `src/data/`.
- [x] Seed, role, clock, fake SMS and repository contract test files.
- [x] M0 decision record in `docs/decisions.md`.

## M2 — Restaurants, public pages, menus and QR

### Implemented; verification not completed

- [x] Operator restaurant list, setup wizard, restaurant edit and plan/status controls; slug validation and duplicate prevention.
- [x] Business hours editor, card stamp/reward rules, welcome stamp, starter menu and credit fields.
- [x] Restaurant theme editor with presets, colors, system font selections, card shapes/backgrounds, radius, tagline, contrast warning, bounded logo upload and guest/public previews.
- [x] Custom client registry with a Daily Grind sample page and card treatment.
- [x] Public restaurant page with hours/open status, menu, active dated special, join calls to action and page-block ordering/visibility for eligible plans.
- [x] Owner menu-section/item management, availability, ordering and special creation/toggle.
- [x] QR print pack layouts, PNG download, print styles, table-source variants and tracked `src` join links.

## M3 — Guest join, cards, My cards and consent

### Implemented; verification not completed

- [x] Guest join flow with South African mobile validation, required loyalty agreement, separate unchecked marketing opt-in, demo verification step, join rate limits and phone-based duplicate membership handling.
- [x] Welcome stamp, loyalty card, member code/QR, reward display, offers, recent visits, new-stamp notice and add-to-home-screen guidance.
- [x] My cards list sorted by available rewards and recent visits; guest settings and profile update.
- [x] Per-restaurant marketing preference, recorded consent wording/history, JSON data export and demo deletion/anonymization.
- [x] HMAC-signed, expiring SMS opt-out link creation and confirmation; customer QR links resolve to the guest's cards.

## Fix-up 2026-10-17 (M0–M3 review)

- [x] verified (typecheck/lint/vitest/build pass) Reward noun phrases + `rewardCopy` templates; seed uses "a free coffee"/"a free main"; storage key `patron-demo-v4`.
- [x] verified (typecheck/build) Card render-write split: `getCard` pure + `markCardSeen` in `useEffect`.
- [x] verified (typecheck/build) `useDemoState()` added; card/join/me/settings/demo/control-bar use it (remaining `useSyncExternalStore` spots: ops/owner/menu/QR/outbox editors).
- [x] verified (typecheck/build) Demo hub tunnels are real deep links (`/demo/as/:role?...&to=...`); pasted links set session in `beforeLoad`.
- [x] verified (typecheck/build) Calm missing states with "Back to demo hub" on card/me/settings/join; browser-only redirects kept.
- [x] verified (typecheck/build) Join-while-guest: continue-as-guest or "Not you? Join as someone else".
- [x] verified (typecheck/build) Cron/webhook files export real `Route`s returning 501 POST; `_demoPlaceholder` moved to `src/components/patron/DemoPlaceholder.tsx`.
- [x] verified (vitest) SMS segments use `countSegments` from `src/lib/segments.ts`.
- [x] verified (vitest) QR capacity test over 20 join/member URLs fails loudly past version 5-L (`src/lib/qr.test.ts`).
- [x] verified (vitest) Cross-restaurant privacy service test (`src/test/cross-restaurant.test.ts`).
- [x] verified (vitest/build) Stamp slots component (`StampSlots`, 40px grid, single "N of M stamps" label) used on guest card.
- [~] built, not verified E2E `tests/e2e/demo-m0.spec.ts` + `demo-m3.spec.ts` (Playwright browsers lack system libs in this cloud VM: `libnspr4.so`).
- [~] built, not verified Full 120-col reformat of all M0–M3 files (new/edited files are clean; legacy one-liners remain).
- [~] built, not verified QR decode with jsqr / phone camera, iPhone Safari, real SMS/DB.

## FIX_missing_pieces (2026-10-17 session)

- [x] verified (typecheck/build) `/demo/status` driven by `src/config/milestones.ts`; linked from hub and marketing footer.
- [x] verified (typecheck/build) Demo-accounts panel, grouped tunnels with milestone badges, reset + busy-week seed (`api.demo.loadBusyWeek`).
- [x] verified (typecheck/build) Marketing: `/pricing`, `/how-it-works`, `/faq`, `/contact` (lead form), `/case-studies` placeholder.
- [x] verified (typecheck/build) Legal drafts: `/privacy`, `/terms`, `/consent-wording` (marked needs lawyer review).
- [x] verified (typecheck/build) System screens: `/offline`, `/session-expired`, `/link-expired`, `/maintenance` (404/500 already in root).
- [x] verified (typecheck/build) Owner onboarding checklist route + data model (`onboarding` in `DemoState`, seeded, v4-tolerant load).
- [x] verified (vitest) Guest JS perf-budget test (`src/test/perf-budget.test.ts`, skips until built).
- [x] verified (typecheck) Privacy-safe analytics (`src/lib/analytics.ts`) and error-log hook (`src/lib/error-log.ts`); support card (`SupportCard`).
- [x] verified (typecheck/build) UI polish: single hero (name/tagline/suburb/join), hours-today highlight, 16px page padding, 480px desktop column, stepper/tile/button/focus styles, QR min 200px, designed not-built placeholders.
- [x] verified (typecheck) No-horizontal-scroll e2e (`tests/e2e/demo-no-scroll.spec.ts`, 7 routes at 360px).
- [~] built, not verified E2E in a real browser at 390/1280 with screenshots (`docs/ui-review/` pending — Playwright lacks system libs in this VM).

## M4 — Staff till (2026-10-17 session)

- [x] verified (vitest 20/20) Rule engine `src/domain/stamps.ts` mirrors `record_stamp`: stamped/too_soon/not_a_member/duplicate_retry, threshold reward + reset, undo with reward void + counter restore, campaign redeem once + stamp award.
- [x] verified (vitest) Team PINs via WebCrypto HMAC-SHA256 (`src/lib/pin.ts`, `src/domain/team.ts`): seeded demo PINs, issue/reset, 5-in-10min lockout, 12h staff session.
- [x] verified (vitest) Single-use 10-minute pairing codes; demo pair-this-device shortcut; restaurant-scoped lookup/stamp (cross-venue refused).
- [x] verified (typecheck/build) Routes `/stamp` (keypad, lookup, Add stamp, undo, redeem, recent), `/app/team`, `/app/audit` (filterable, no PINs/phones).
- [x] verified (vitest) SQL contract table `STAMP_CONTRACT` (`src/test/stamp-contract.test.ts`), reusable in M9.
- [~] built, not verified BarcodeDetector camera path (JS QR fallback = typed codes); phone-camera scan, vibration, iPhone Safari.

## M5 — Owner dashboard (2026-10-17 session)

- [x] verified (typecheck/build) Owner shell `/app` (sidebar desktop, bottom nav phones) with Overview; old demo placeholder removed; marketing still links to `/demo`.
- [x] verified (vitest) `dash.overview()` single service: hand-computed seed values, lapsed rises with clock and matches Lapsed-30 filter, 8-week chart data, tooltips on every number.
- [x] verified (vitest) Customers: search/filter/sort/pagination at 25, masked phones, reveal + CSV export audited, manager export refused, profile timeline, manual stamp, remove-from-list keeps counts.
- [x] verified (vitest) Loyalty editor validation; lowering 8→6 keeps earned rewards, excess converts on next stamp; Settings sender/caps validation.
- [x] verified (typecheck) Manager role in services + UI guards (team/audit/export stay owner-only); DemoControlBar + deep links accept manager.
- [~] built, not verified M5 e2e at 360px card layout; CSV download bytes; real-browser shell nav.

## Verification still requested

- [x] verified (how: `npm run typecheck` clean; `npm run lint` 0 errors; `npx vitest run` 28/28; `npm run build` ok) Typecheck, lint, unit tests and production build.
- [~] built, not verified Browser walkthrough of routes, role redirects, QR scanning/PNG exports and opt-out confirmation.
- [~] built, not verified Check cross-tab state, clock-driven elapsed time and responsive layout at 360/390 px.
- [~] built, not verified Confirm QR images with a scanner; current QR encoder supports short links up to version 5-L.

The user explicitly asked to proceed with M2/M3 without blocking on these verification issues and said they will handle any verification blockers.

## M6 — Credit ledger and SMS adapter (2026-10-18 session, demo mode)

- [x] verified (vitest 16/16) Ledger domain `src/domain/credit.ts`: reserve/release/charge/refund/adjustment/topup with unique `reference`, integer cents, balance = sum, never negative; `CREDIT_CONTRACT` table for M9.
- [x] verified (vitest) Duplicate topup confirmation writes exactly one entry; concurrent reserves never go below zero; adjustments need a note.
- [x] verified (typecheck/build) `/app/credit` (balance, PAT-{slug}-{4 digits} references, EFT placeholder, plain-English labels) and `/ops/credit` (confirm EFT, adjustments, audit).
- [x] verified (vitest) SPEC 9.1 `SmsProvider` interface; `SMS_PROVIDER` selection; smssouthafrica/sendmode stubs throw not configured; segment vectors from SPEC 9.2 (fixed two `countSegments` bugs: multipart uses 153 per segment, UCS-2 counts code points).
- [x] verified (vitest) Webhook idempotency by (provider, event_id); replay is a no-op; inbound STOP withdraws that restaurant only; OTP cost logged per new join.
- [~] built, not verified Real-browser credit pages at 360px; real provider, EFT details, TEST database.

## M7 — Campaigns (2026-10-18 session, demo mode)

- [x] verified (vitest 11/11) Campaign engine `src/domain/campaigns.ts`: audience presets with caps, merge field, Stop footer in segments, smart-quote/emoji warnings with fix, cost preview, atomic confirm, pure `dispatchBatch`, settlement, refunds, approvals, results.
- [x] verified (vitest) 84 eligible guests reserve/send/settle with the ledger invariant; consent withdrawn after confirm is skipped and not charged; insufficient credit blocks with a clear message; caps exclude at send time; quiet hours push to 08:00 SAST; operator draft needs approval; dispatcher kill/restart sends nothing twice; double redeem fails.
- [x] verified (typecheck/build) Composer `/app/campaigns/new` (4 steps, draft each step, typed SEND over 200), list with approval flags, results page with attributable-visits label, `/ops/campaigns` drafts, dispatcher button on `/demo/outbox`, cron routes behind CRON_SECRET (501 in demo).
- [x] verified (typecheck) Offer redemption reuses `redeemCampaignCode` (now rejects non-sent campaigns); till UI already connected.
- [x] Seed: one sent campaign result + one draft for The Daily Grind (storage key bumped to patron-demo-v5).
- [~] built, not verified Real-browser composer/results at 360/390px; Playwright E2E.

## Neon slices 1–3 (2026-10-19 session, built, not verified vs live DB)

- [x] built, not verified (vitest 17/17 pass vs demo; pg tests skip without dev DATABASE_URL) Async repo contract (`src/server/repos/contracts.ts`) + demo adapter + Postgres adapter (`withContext`, ≤3 round trips, cents/timestamptz) + `DATA_MODE=demo|live` switch. Demo mode unchanged.
- [x] built, not verified `npm run db:seed:dev` seeds Daily Grind / Sunrise Bakes / Oak Table (+menus/specials) into the DEV branch only; refuses production.
- [x] built, not verified Slice 1: public `/r/:slug` page + `lead.submit` (honeypot + rate limit) wired through `src/server/fns/`.
- [x] built, not verified Slice 2: guest join (phone normaliser, consent_event wording text/version) + card + My cards. Demo OTP kept as a marked seam; no real auth.
- [x] built, not verified Slice 3: stamping via `record_stamp` SQL function (stamped/too_soon/duplicate_retry/reward), `audit_event` rows, till PIN HMAC check.
- [x] built, not verified Cross-tenant RLS test (skips without dev DB; `scripts/rls-check.mjs` still the canonical check), record_stamp path tests, withContext grep test (SPEC 8.1).
- [x] verified (this session) `tsc --noEmit` clean, `eslint` 0 errors (repo-wide: 0 errors, 11 pre-existing warnings), full vitest 118 passed / 3 skipped (skips need dev `DATABASE_URL`), `pnpm build` ok.
- [ ] Not run: seed/live queries/RLS/SQL `record_stamp` against the dev branch (needs dev `DATABASE_URL` + `DATABASE_URL_MIGRATE`); production branch never touched.

## Neon fixes (2026-10-19 session, built, not verified vs live DB)

- [x] verified (vitest) `submitLead` calculator value restored (15 cols/15 vals; count test in `lead-insert.test.ts`); lead rate limit per phone AND per IP (demo + live).
- [x] verified (vitest) Till PIN never skipped: empty/non-4-digit throws "PIN required", missing `PIN_PEPPER` throws, constant-time HMAC compare, `rate_limit_hit` lockout (5 fails/10 min → 15 min lock, same "Wrong PIN." error, locked attempts unrecorded). Live wrong-PIN/lockout tests skip without dev DB.
- [x] verified (guards run, exit 1, no DB touched) `db:seed:dev` runs in one tx with `app.is_operator`, refuses unless target host differs from `PROD_DB_HOST` + `DEV_SEED_CONFIRM=yes` + dev `SEED_BRANCH`; seeds full themes/hours, 60 guests, memberships, consents, stamps, rewards, staff PINs, ledger topups.
- [x] verified (typecheck/lint/build) Live UI path: `src/server/live.ts` (`createServerFn`, `isOperator` always false server-side, IP hashed server-side) wired into `/r/:slug`, join, card, till stamp and `LeadForm`; demo default unchanged.
- [x] verified (vitest, demo) Two joins with the same phone return the same customer; `join:<phone>`/`seed:<phone>` documented as auth placeholders in `docs/decisions.md`.
- [x] verified (this session) `tsc --noEmit` clean, `eslint` 0 errors, full vitest 126 passed / 5 skipped (skips need dev DB URLs), `pnpm build` ok.
- [ ] Not run against a real dev database: seed contents, live page/join/card/stamp flows, SQL `record_stamp`, RLS isolation. Production branch never touched.

## Not in scope yet

- [ ] M1 marketing milestone is parked; M8–M9 are not started.
- [ ] Real authentication/OTP, SMS sending, Neon-backed persistence and real object storage remain deferred. M0/M2/M3 data changes are demo-only.

## GitHub

- [x] M0/M2/M3 implementation pushed to `vibe/m1-m3-implementation-ab5f40` in `Karma-Q56/japandi-calc-home` at commit `ddae6f7`.

- [~] PIN lockout is "fixed, not verified against a real dev database": the wrong-PIN `rate_limit_hit` insert now commits in its own transaction before the throw (previously it rolled back with the stamp transaction, so the lockout never triggered). Proven by `src/server/repos/pin-commit.test.ts` (mocked `withContext` with rollback semantics); the 6th-attempt-with-correct-PIN live assertion in `pin-live.test.ts` still needs a real dev database (`DATABASE_URL` + `DATABASE_URL_MIGRATE`).

## Dev-branch verification (2026-10-20 session, verified on dev branch "Freebuffy")

- [x] verified (dev branch) `.dev.vars` copied to the project root, gitignored via `.dev.vars*` (never printed, logged or committed). Safety check: `DATABASE_URL` hostname `ep-gentle-sky-ba6lmqfl-pooler…` differs from `PROD_DB_HOST` `ep-floral-cherry-bajduchg-pooler…`; `select current_user` returns `app_user` on `DATABASE_URL` and `neondb_owner` on `DATABASE_URL_MIGRATE`.
- [x] verified (dev branch) `node scripts/seed-dev.mjs` exit 0. Fixed a real seed bug: `bulkInsert` built `$1…` params but never passed them to `tx.unsafe` (CODE fix in `scripts/seed-dev.mjs`). Owner-view row counts: restaurant 3, menu_section 4, menu_item 6, special 3, staff_member 3, customer 60, membership 60, consent_event 105, stamp_event 202, reward 7, credit_ledger 3. (As `app_user` without context most tables read 0 — expected RLS.)
- [x] verified (dev branch, default pool) Live DB tests, previously 5 skipped, now all pass: `pin-live` (empty/wrong PIN rejected, correct PIN stamps, 5 wrongs lock out the 6th correct attempt), `rls-live` (restaurant-A context sees zero B rows, B update affects 0), `repo-contract` postgres suite (5/5: page shape, lead submit, join+card round-trip, same-phone same customer, bad phone rejected). Demo halves pass too (12/12 in the three files).
- [x] verified (dev branch) Real bug found by the postgres contract test and fixed in CODE: public `submitLead` always failed with `new row violates RLS policy for table "lead"` because `insert … returning id` needs a passing SELECT policy and lead SELECT is operator-only. `submitLead` in `src/server/repos/pg.ts` now runs its tx as operator server-side (same trusted-server precedent as `joinGuest`); public read/update of leads stays operator-only, matching `docs/decisions.md`.
- [x] verified (dev branch) `DATA_MODE=live` scripted exercises, all as asserted: public pages for daily-grind/sunrise-bakes/oak-table; fresh join + card; correct-PIN stamp → `stamped`; same idempotency key → `duplicate_retry`; 5 wrong PINs then the CORRECT PIN → rejected during lockout (throwaway staffer, cleaned up with its rate rows); near-threshold member stamps to `reward`; cross-venue `getCard` returns null while own-venue card reads fine.
- [x] verified (this session) `tsc --noEmit` clean. Test-harness fixes (no assertions touched): hoisted `await import()` out of test bodies in `pin-commit`/`pin-live`/`rls-live` (dynamic import inside the body blew the 5s default timeout on this machine) and added `{ timeout: 120_000 }` to live-Neon tests (sequential EU roundtrips exceed 5s from here).
- [~] could not run: `vitest --pool=forks` — the forks pool hangs on this Windows machine even for a single 1-test file (no output before the timeout), while the default threads pool runs the same file fine; the full 24-file suite also exceeds a 550 s budget here (per-file runs used instead). Full-suite green on this machine is still outstanding.
