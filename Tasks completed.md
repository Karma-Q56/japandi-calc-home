# Patron task status

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

## Verification still requested

- [ ] Typecheck, lint, unit tests and production build.
- [ ] Browser walkthrough of routes, role redirects, QR scanning/PNG exports and opt-out confirmation.
- [ ] Check cross-tab state, clock-driven elapsed time and responsive layout at 360/390 px.
- [ ] Confirm QR images with a scanner; current QR encoder supports short links up to version 5-L.

The user explicitly asked to proceed with M2/M3 without blocking on these verification issues and said they will handle any verification blockers.

## Not in scope yet

- [ ] M1 marketing milestone is parked; M4–M9 are not started.
- [ ] Real authentication/OTP, SMS sending, Neon-backed persistence and real object storage remain deferred. M0/M2/M3 data changes are demo-only.

## GitHub

- [ ] Current changes have not yet been committed or pushed.
