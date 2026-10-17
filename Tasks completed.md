# Patron task status

> Review 2026-10-17: the snapshot received did not typecheck or build (missing `updateDemo`, missing state fields), and nested pages (`/r/:slug/join`, `/r/:slug/card`, `/me/settings`, `/app/menu`, `/app/qr`, `/ops/restaurants/new` and others) rendered their parent page because parents had no outlet. Role guards also redirected every reload and QR scan to `/demo` because the server cannot read the demo session. All fixed (see docs/decisions.md). Verified by hand in a 390 px browser: demo hub, guest join to card, My cards, operator wizard creating a restaurant and its public page, owner menu and QR print pack, member QR decodes with a real reader. Still placeholders: staff till (M4), owner dashboard (M5), credit (M6), campaigns (M7), PWA/push (M8), M9.

Updated 2026-10-16. Work is on `vibe/m1-m3-implementation-ab5f40`, based on the latest fetched Patron branch requested earlier. Authentication remains skipped. The current app is a browser-only demo backed by local storage and seeded data.

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

## Verification still requested

- [x] verified (how: `npm run typecheck` clean; `npm run lint` 0 errors; `npx vitest run` 28/28; `npm run build` ok) Typecheck, lint, unit tests and production build.
- [~] built, not verified Browser walkthrough of routes, role redirects, QR scanning/PNG exports and opt-out confirmation.
- [~] built, not verified Check cross-tab state, clock-driven elapsed time and responsive layout at 360/390 px.
- [~] built, not verified Confirm QR images with a scanner; current QR encoder supports short links up to version 5-L.

The user explicitly asked to proceed with M2/M3 without blocking on these verification issues and said they will handle any verification blockers.

## Not in scope yet

- [ ] M1 marketing milestone is parked; M4–M9 are not started.
- [ ] Real authentication/OTP, SMS sending, Neon-backed persistence and real object storage remain deferred. M0/M2/M3 data changes are demo-only.

## GitHub

- [x] M0/M2/M3 implementation pushed to `vibe/m1-m3-implementation-ab5f40` in `Karma-Q56/japandi-calc-home` at commit `ddae6f7`.
