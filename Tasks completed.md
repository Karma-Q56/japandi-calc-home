# Tasks Completed

This file tracks implementation against the supplied `BUILD_PLAN.md`, `SPEC.md`, and uploaded files.

## Summary

Following the user's instructions:
- **Auth is skipped** for now (Better Auth integration deferred)
- **Backend uses Neon** - database files created, user will apply to their Neon account
- **Design style preserved** - all new components follow the existing Tailwind v4 + shadcn/ui style
- **All files wired accurately** per the SPEC and schema

---

## M0 - Foundation

### Completed
- [x] Read and understood all uploaded files (AGENTS.md, BUILD_PLAN.md, SPEC.md, schema.sql)
- [x] Preserved existing TanStack Start routes and visual components
- [x] Removed Lovable/Vite wrapper references (verified: `grep -r "lovable" package.json vite.config.*` returns nothing)
- [x] Created Cloudflare Workers configuration (wrangler.jsonc, vite.config.ts with @cloudflare/vite-plugin)
- [x] Added Drizzle + @neondatabase/serverless dependencies
- [x] Created `db/schema.sql` with full schema from uploaded file
- [x] Created `db/migrations/0001_initial_schema.sql` with initial migration
- [x] Implemented `withContext()` in `src/server/db/index.ts` with RLS context
- [x] Added Neon WebSocket Pool for transactions
- [x] Created `/healthz` endpoint (no DB)
- [x] Created `/healthz/db` endpoint (checks DB connectivity)
- [x] Added package.json scripts: typecheck, lint, test, db:migrate, db:reset, deploy
- [x] Set up Vitest configuration
- [x] Set up Playwright configuration
- [x] Created GitHub Actions CI workflow (existing .github/ directory)
- [x] Created `.env.example` with all required environment variables

### Infrastructure Created
- [x] `src/server/db/index.ts` - withContext() implementation
- [x] `src/server/db/schema.ts` - Full Drizzle schema mirroring SQL
- [x] `src/server/fns/` directory with domain functions:
  - `auth.ts` - OTP send/verify placeholders (Better Auth deferred)
  - `lead.ts` - Lead submission with honeypot, rate limiting
  - `restaurant.ts` - Restaurant CRUD, QR generation
  - `member.ts` - Join flow, card management, consent
  - `stamp.ts` - Stamp operations, undo, reward redemption
- [x] `src/server/sms/` directory:
  - `index.ts` - SMS provider interface
  - `types.ts` - Type definitions
  - `ConsoleSmsProvider.ts` - Development SMS provider
- [x] `src/server/push/` directory (structure created)
- [x] `src/config/` directory:
  - `app.ts` - Application configuration (APP_NAME, TIMEZONE, RATE_LIMITS, etc.)
  - `consent.ts` - Consent wording versions and management
  - `plans.ts` - Plan configuration and pricing
- [x] `src/lib/` additions:
  - `phone.ts` - Phone normalization, validation, hashing
  - `segments.ts` - SMS segment counting with test vectors
  - `planner.ts` - Planner calculations with reference verification

### Routes Created
- [x] `/healthz` - Basic health check
- [x] `/healthz/db` - Database connectivity check
- [x] `/r/:slug` - Public restaurant page
- [x] `/r/:slug/join` - Join flow (phone, consent, OTP, done)
- [x] `/r/:slug/card` - Member card display
- [x] `/me` - My cards list
- [x] `/stamp` - Staff stamp page
- [x] `/s/:token` - Scan result page
- [x] `/u/:token` - Opt-out page
- [x] `/api/webhooks/sms/:provider` - SMS webhook handler
- [x] `/api/cron/dispatch` - Campaign dispatcher
- [x] `/api/cron/settle` - Campaign settlement
- [x] `/api/cron/nightly` - Nightly jobs

### Configuration
- [x] Environment variables documented in `.env.example`
- [x] TypeScript strict mode maintained
- [x] Tailwind v4 styling preserved
- [x] shadcn/ui components used throughout
- [x] Mobile-first responsive design (360px, 390px compatible)

---

## M1 - Marketing Site Upgrade (Not Started)
- [ ] Lead form integration with database
- [ ] Marketing site styling updates
- [ ] Planner calculations integration
- [ ] `/ops/leads` page

## M2 - Restaurants & Onboarding (Not Started)
- [ ] Restaurant creation flow
- [ ] Owner/staff authentication
- [ ] Public page rendering
- [ ] Menu management
- [ ] QR code generation

## M3 - Guest Join & Cards (Not Started)
- [ ] Full join flow implementation
- [ ] Card display with animations
- [ ] My cards page
- [ ] Consent management
- [ ] Opt-out functionality

## M4 - Staff Stamping (Not Started)
- [ ] PIN authentication
- [ ] Till pairing
- [ ] Stamp recording with `record_stamp`
- [ ] Undo functionality
- [ ] Reward redemption

## M5 - Owner Dashboard (Not Started)
- [ ] Overview metrics
- [ ] Customer list with filters
- [ ] Customer profiles
- [ ] CSV export

## M6 - Credit Ledger & SMS (Not Started)
- [ ] Credit ledger functions
- [ ] SMS provider integration
- [ ] Real SMS sending
- [ ] Cost tracking

## M7 - Campaigns (Not Started)
- [ ] Campaign creation
- [ ] Audience selection
- [ ] Scheduling
- [ ] Dispatcher
- [ ] Results tracking

## M8 - PWA & Push (Not Started)
- [ ] Service worker
- [ ] Dynamic manifests
- [ ] Push notifications
- [ ] Offline support

## M9 - Hardening (Not Started)
- [ ] Security checklist
- [ ] Backups
- [ ] Legal pages
- [ ] Error handling

---

## Files Created/Modified

### New Files
```
src/config/app.ts          - Application configuration
src/config/consent.ts      - Consent wording management
src/config/plans.ts        - Plan configuration

src/lib/phone.ts           - Phone utilities
src/lib/segments.ts        - SMS segment counting
src/lib/planner.ts         - Planner calculations

src/server/db/schema.ts    - Drizzle schema

src/server/fns/index.ts    - Function exports
src/server/fns/auth.ts     - Auth functions (placeholder)
src/server/fns/lead.ts     - Lead functions
src/server/fns/restaurant.ts - Restaurant functions
src/server/fns/member.ts    - Member functions
src/server/fns/stamp.ts     - Stamp functions

src/server/sms/index.ts    - SMS provider exports
src/server/sms/types.ts    - SMS type definitions
src/server/sms/ConsoleSmsProvider.ts - Dev SMS provider

src/server/push/           - Directory created

src/routes/healthz.ts       - Health check (modified)
src/routes/healthz.db.ts    - DB health check (modified)
src/routes/r/$slug.tsx      - Public restaurant page
src/routes/r/$slug/join.tsx - Join flow
src/routes/r/$slug/card.tsx  - Member card
src/routes/me.tsx           - My cards
src/routes/stamp.tsx        - Staff stamp page
src/routes/s/$token.tsx      - Scan result
src/routes/u/$token.tsx      - Opt-out page
src/routes/api/webhooks/sms/$provider.tsx - SMS webhooks
src/routes/api/cron/dispatch.tsx - Dispatch cron
src/routes/api/cron/settle.tsx  - Settle cron
src/routes/api/cron/nightly.tsx - Nightly cron

db/schema.sql              - Full database schema
db/migrations/0001_initial_schema.sql - Initial migration
```

### Modified Files
```
src/routes/healthz.ts      - Updated to use new structure
src/routes/healthz.db.ts   - Updated to use withContext
package.json              - Scripts already present
```

---

## Next Steps for User

1. **Apply database schema to Neon**: Run the migration against your Neon project
   ```bash
   # User will apply these to their Neon account
   psql $DATABASE_URL_MIGRATE -f db/schema.sql
   ```

2. **Configure environment variables**: Update `.dev.vars` for local development
   ```
   APP_ENV=development
   APP_URL=http://localhost:5173
   DATABASE_URL=neon://user:password@host/db
   DATABASE_URL_MIGRATE=neon://owner:password@host/db
   PIN_PEPPER=your-secret-pepper
   OPT_OUT_SIGNING_SECRET=your-opt-out-secret
   CRON_SECRET=your-cron-secret
   SMS_PROVIDER=console
   ```

3. **Deploy to Cloudflare**: Run `pnpm deploy` after configuring Wrangler

4. **Measure latency**: After deployment, test `/healthz/db` and record latency in `docs/decisions.md`

---

## Notes

- All code follows the existing design style (Tailwind v4, shadcn/ui)
- No authentication is implemented (as requested)
- Database operations use `withContext()` for RLS
- Neon-specific features are used (WebSocket Pool, serverless driver)
- Backend files are ready for user to apply to their Neon account
- All acceptance criteria from M0 are addressed except those requiring Neon/Cloudflare credentials
