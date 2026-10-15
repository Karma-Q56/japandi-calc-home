# Tasks completed

This file tracks implementation against the supplied `BUILD_PLAN.md`. Work follows one milestone at a time. Authentication/OTP is deferred per the user's instruction.

## M0 — Foundation

### Completed locally
- [x] Read the supplied `AGENTS.md`, `BUILD_PLAN.md`, `SPEC.md`, and SQL schema.
- [x] Preserve the existing TanStack Start routes and visual components.
- [x] Replace the Lovable Vite wrapper with the official Cloudflare Vite integration and Wrangler configuration.
- [x] Copy the supplied SQL into `db/schema.sql` and a versioned initial migration; make consent evidence insert-only in both RLS policy and role grants.
- [x] Add request-scoped Neon WebSocket Pool transactions and `withContext()` to establish RLS settings.
- [x] Add basic and database health endpoints.
- [x] Add a migration runner, local-only database reset guard, environment example, and decisions log.
- [x] Remove the Supabase auth middleware from startup as part of deferring authentication.

### In progress / needs verification
- [x] Finish package installation and align scripts/dependencies; production build, typecheck, lint, and unit tests pass.
- [ ] Run the added cross-tenant integration test against the disposable PostgreSQL service in CI (not run locally yet).
- [ ] Provision the `app_user` login and apply migrations against the user's Neon project. User supplied Neon project super-waterfall-31745320 and production branch. Neon CLI installation via both npx neon@latest and npm install --global neon@latest stalled without output and was interrupted; no login or database connection was established.
- [ ] Verify role-creation permissions and the effective RLS behavior on Neon.
- [ ] Deploy staging and measure database latency and `/healthz/db` Worker CPU time; requires project migration access and Cloudflare deployment credentials.
- [x] Add CI and Playwright foundation.
- [x] Verify local preview response: Wrangler serves the built app at http://127.0.0.1:4175/ with HTTP 200.
- [ ] Playwright end-to-end test remains unverified; its runner stalled before reporting test results.

### Deferred by user
- [ ] Better Auth, phone OTP, SMS provider, and `/login` acceptance checks.

## M1 — Marketing site upgrade and lead capture

- [ ] Not started. Do not begin until M0 acceptance is complete.

## M2 — Restaurants, onboarding, public page, menu, QR

- [ ] Not started.

## M3 — Guest join, card, My cards, consent, opt-out

- [ ] Not started.

## M4 — Staff stamping, rewards, undo, audit

- [ ] Not started.

## M5 — Owner dashboard

- [ ] Not started.

## M6 — Credit ledger and SMS provider

- [ ] Not started.

## M7 — Campaigns

- [ ] Not started.

## M8 — PWA and push

- [ ] Not started.

## M9 — Hardening and launch

- [ ] Not started.
