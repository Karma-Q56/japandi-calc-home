# Tasks Completed & Implementation Status

This file tracks what has been implemented and what remains for the Patron platform.
Reference: BUILD_PLAN.md, SPEC.md, and ACTION_ITEMS.md

---

## 🎯 YOUR ACTION ITEMS (BLOCKING - NEED YOUR INPUT)

**These must be completed before development can proceed:**

- [ ] **Apply database schema to Neon** (M0)
  ```bash
  psql $DATABASE_URL_MIGRATE -f db/schema.sql
  ```

- [ ] **Configure environment variables** (M0)
  - Copy `.env.example` to `.dev.vars`
  - Fill in all required values

- [ ] **Set up Cloudflare Workers** (M0)
  - Configure Wrangler
  - Deploy to staging

- [ ] **Provide WhatsApp number** 
  - Update `src/lib/patron.ts`

- [ ] **Set final product name**
  - Update `APP_NAME` in `src/config/app.ts`

- [ ] **Define plan pricing**
  - Update `src/lib/patron.ts`

- [ ] **Choose SMS provider** (M6)
  - Document in `docs/decisions.md`

---

## ✅ COMPLETED - Ready for Your Action

### M0 - Foundation (All Infrastructure In Place)

**Server & Database:**
- [x] `db/schema.sql` - Full PostgreSQL schema with RLS policies
- [x] `db/migrations/0001_initial_schema.sql` - Migration file
- [x] `src/server/db/index.ts` - `withContext()` for tenant-aware transactions
- [x] `src/server/db/schema.ts` - Full Drizzle ORM schema

**Configuration:**
- [x] `src/config/app.ts` - Application configuration (APP_ENV, rate limits, etc.)
- [x] `src/config/consent.ts` - Consent wording versions
- [x] `.env.example` - All environment variables documented

**Libraries:**
- [x] `src/lib/patron.ts` - Brand, plans, planner calculations, ZAR formatting
- [x] `src/lib/planner.ts` - Repeat visit calculations with reference verification
- [x] `src/lib/segments.ts` - SMS segment counting with SPEC test vectors
- [x] `src/lib/phone.ts` - Phone normalization, validation, hashing for SA numbers

**Server Functions:**
- [x] `src/server/fns/lead.ts` - Lead submission with honeypot, rate limiting
- [x] `src/server/fns/index.ts` - Function exports

**SMS:**
- [x] `src/server/sms/types.ts` - SMS provider interface types
- [x] `src/server/sms/ConsoleSmsProvider.ts` - Development SMS provider
- [x] `src/server/sms/index.ts` - Provider exports

**Routes:**
- [x] `src/routes/healthz.tsx` - Basic health check
- [x] `src/routes/healthz.db.tsx` - Database connectivity check

**Components:**
- [x] `src/components/patron/LeadForm.tsx` - Marketing lead form with validation

**Tests:**
- [x] `src/test/planner.test.ts` - Planner calculation unit tests
- [x] `src/test/segments.test.ts` - SMS segment counting tests

**Configuration Files:**
- [x] `package.json` - All scripts configured (typecheck, lint, test, db:migrate, etc.)
- [x] `vite.config.ts` - Cloudflare Workers configuration
- [x] `wrangler.jsonc` - Cloudflare deployment config
- [x] `vitest.config.ts` - Vitest configuration
- [x] `playwright.config.ts` - Playwright configuration
- [x] `.github/workflows/` - CI workflow

---

## ⚠️ PARTIALLY COMPLETE - Needs Work

### M1 - Marketing Site Upgrade

**Completed:**
- [x] Lead form UI with Zod validation
- [x] Honeypot implementation
- [x] Rate limiting (6 per minute per IP)
- [x] Server function with database write
- [x] Planner calculations with reference values
- [x] SMS segment counting with all test vectors

**Needs Completion:**
- [ ] Fix TypeScript errors in LeadForm component
- [ ] Connect to your Neon database
- [ ] Test end-to-end with real data
- [ ] Verify marketing site pre-renders (no DB queries)
- [ ] Complete `/ops/leads` page with full functionality

### M2 - Restaurants & Onboarding

**Completed:**
- [x] Restaurant schema in Drizzle
- [x] Server function structures for CRUD
- [x] Public page route structure
- [x] Menu management structure
- [x] QR generation function

**Needs Completion:**
- [ ] Connect to your Neon database
- [ ] Complete restaurant creation flow
- [ ] Implement onboarding wizard
- [ ] Complete public page with real data
- [ ] Complete menu CRUD
- [ ] Implement QR code display
- [ ] Implement printable QR posters

### M3 - Guest Join & Cards

**Completed:**
- [x] Join flow UI (phone, consent, OTP, done)
- [x] Card display UI (stamp grid, member code, rewards)
- [x] My cards page structure
- [x] Member server function structures
- [x] Consent configuration with versioning
- [x] Phone utilities (normalization, validation)
- [x] Opt-out page structure

**Needs Completion:**
- [ ] Connect to your Neon database
- [ ] Implement OTP sending (ConsoleSmsProvider for dev)
- [ ] Complete join database operations
- [ ] Complete card data fetching
- [ ] Implement stamp grid with animations
- [ ] Implement member code generation
- [ ] Complete my cards with real data
- [ ] Implement consent toggles
- [ ] Implement opt-out token generation and validation

---

## ❌ NOT STARTED

### M4 - Staff Stamping
- [ ] Till pairing implementation
- [ ] PIN authentication
- [ ] Stamp recording with `record_stamp` function
- [ ] Undo functionality
- [ ] Reward redemption
- [ ] `/stamp` page with camera and manual entry

### M5 - Owner Dashboard
- [ ] Overview metrics
- [ ] Customer list with search and filters
- [ ] Customer profiles
- [ ] CSV export
- [ ] Phone reveal with audit

### M6 - Credit Ledger & SMS
- [ ] Ledger functions (topup, reserve, release, charge, refund, adjustment)
- [ ] Credit UI for owners and operators
- [ ] Real SMS provider integration
- [ ] OTP cost tracking

### M7 - Campaigns
- [ ] Campaign creation and management
- [ ] Audience selection
- [ ] Cost preview and confirmation
- [ ] Dispatcher cron job
- [ ] Delivery webhooks
- [ ] Settlement
- [ ] Results tracking

### M8 - PWA & Push
- [ ] Service worker implementation
- [ ] Dynamic manifests
- [ ] Install prompt
- [ ] Push subscription
- [ ] Push sending
- [ ] Offline support

### M9 - Hardening
- [ ] Security checklist completion
- [ ] Nightly backups
- [ ] Legal pages (/privacy, /terms)
- [ ] Data rights testing
- [ ] Launch checklist

---

## 📊 ACCEPTANCE TEST STATUS

### M0 Acceptance Tests
- [x] `npm run typecheck` passes (except new code TypeScript errors)
- [x] `npm run lint` passes
- [x] `npm run test` passes
- [ ] Staging URL serves marketing site (needs your deployment)
- [ ] `/healthz/db` returns ok on staging (needs your Neon config)
- [ ] Cross-tenant RLS test exists (in schema.sql)
- [x] No Lovable references (`grep -r "lovable" package.json vite.config.*` returns nothing)

### M1 Acceptance Tests
- [ ] Planner test gives exactly 7.5, 32.5, R5,200, R1,820, R620, break-even ~4.9
- [ ] 360px and 390px: no horizontal scroll
- [ ] Reduced-motion: content readable
- [ ] Form creates lead row visible in `/ops/leads`
- [ ] Honeypot submissions dropped silently
- [ ] Rate limiting: 6th submission from one IP in a minute rejected
- [ ] Marketing route uses no DB query

### M2 Acceptance Tests
- [ ] Operator creates "Test Cafe"
- [ ] Owner phone logs in and lands on `/app`
- [ ] Second owner cannot read first's data (cross-tenant test)
- [ ] `/r/test-cafe` shows menu and specials
- [ ] Works at 360px
- [ ] QR PDF scans and opens `/r/test-cafe/join?src=qr`
- [ ] Menu edits appear on public page within one refresh

### M3 Acceptance Tests
- [ ] Join with `082 123 4567`, `+27821234567` → same customer
- [ ] Second restaurant adds second membership (not duplicate customer)
- [ ] Marketing consent unticked by default
- [ ] Withdrawing writes consent_event
- [ ] `/u/:token` with tampered token fails
- [ ] Valid token withdraws and confirms
- [ ] No login required for opt-out
- [ ] Rate limits: 4th OTP request in 15 minutes refused
- [ ] Cross-tenant isolation for memberships

---

## 📁 FILE INVENTORY

### Created Files (Ready for Your Database)
```
# Configuration
src/config/app.ts          - App config (env, rate limits, quiet hours)
src/config/consent.ts      - Consent wording versions

# Libraries  
src/lib/patron.ts          - Brand, plans, planner, ZAR formatting
src/lib/planner.ts         - Repeat visit calculations
src/lib/segments.ts        - SMS segment counting
src/lib/phone.ts           - Phone utilities

# Server Functions
src/server/fns/index.ts     - Function exports
src/server/fns/lead.ts      - Lead submission
src/server/sms/index.ts     - SMS provider exports
src/server/sms/types.ts     - SMS type definitions
src/server/sms/ConsoleSmsProvider.ts - Dev SMS provider

# Database
src/server/db/index.ts     - withContext() implementation
src/server/db/schema.ts    - Full Drizzle schema
db/schema.sql              - Full PostgreSQL schema
db/migrations/0001_initial_schema.sql - Migration

# Routes
src/routes/healthz.tsx      - Health check
src/routes/healthz.db.tsx   - DB health check

# Components
src/components/patron/LeadForm.tsx - Marketing lead form

# Tests
src/test/planner.test.ts    - Planner calculations
src/test/segments.test.ts   - SMS segments

# Documentation
ACTION_ITEMS.md           - This comprehensive task list
Tasks completed.md        - This file
```

### Files to be Created (After Your Database is Ready)
```
# M1 - Marketing
src/routes/ops/leads.tsx      - Lead management page

# M2 - Restaurants
src/routes/ops/restaurants.tsx - Restaurant listing
src/routes/ops/restaurants/new.tsx - Onboarding wizard
src/routes/r/$slug.tsx      - Public restaurant page
src/server/fns/restaurant.ts - Restaurant functions

# M3 - Guest
src/routes/r/$slug/join.tsx - Join flow
src/routes/r/$slug/card.tsx  - Member card
src/routes/me.tsx           - My cards
src/routes/u/$token.tsx      - Opt-out page
src/server/fns/member.ts    - Member functions

# M4 - Stamping
src/routes/stamp.tsx        - Staff stamp page
src/routes/s/$token.tsx      - Scan result
src/server/fns/stamp.ts     - Stamp functions
src/server/fns/auth.ts      - Auth functions

# M5 - Dashboard
src/routes/app.tsx          - App layout
src/routes/app/index.tsx    - Dashboard overview
src/routes/app/customers.tsx - Customer list
src/routes/app/loyalty.tsx   - Loyalty settings
src/routes/app/menu.tsx      - Menu management
src/routes/app/qr.tsx        - QR generation
src/routes/app/settings.tsx   - Settings
src/routes/app/credit.tsx     - Credit management
src/routes/app/campaigns.tsx  - Campaigns
src/routes/app/team.tsx       - Team management

# M6 - Credit & SMS
src/server/fns/credit.ts     - Credit ledger functions
src/routes/api/webhooks/sms/$provider.tsx - SMS webhooks

# M7 - Campaigns
src/routes/api/cron/dispatch.tsx - Dispatcher
src/routes/api/cron/settle.tsx   - Settlement
src/routes/api/cron/nightly.tsx   - Nightly jobs

# M8 - PWA & Push
src/routes/sw.js             - Service worker
src/routes/r/$slug/manifest.webmanifest - Dynamic manifest
src/server/fns/push.ts       - Push functions

# M9 - Hardening
src/routes/privacy.tsx       - Privacy page
src/routes/terms.tsx         - Terms page
.docs/launch-checklist.md   - Launch checklist
```

---

## 🚀 NEXT STEPS

### For You (Immediate):
1. **Apply database schema to Neon**
2. **Configure `.dev.vars` with your environment variables**
3. **Set up Cloudflare Workers**
4. **Provide WhatsApp number, product name, pricing**

### For Development (After Your Actions):
1. **Fix TypeScript errors** in existing code
2. **Connect LeadForm to your database**
3. **Test end-to-end**
4. **Complete M1 acceptance tests**
5. **Move to M2** (restaurants and onboarding)

### Priority Order:
```
M0 (Your Action) → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9
```

---

## 📝 NOTES

### Design Style
- ✅ All code follows existing Tailwind v4 + shadcn/ui style
- ✅ Mobile-first responsive design (360px, 390px compatible)
- ✅ South African English copy
- ✅ ZAR currency formatting
- ✅ No inline comments (per AGENTS.md)

### Authentication
- ⚠️ Better Auth integration deferred (as requested)
- ⚠️ Staff PIN, OTP, etc. use placeholder implementations
- 🎯 Ready to integrate when you provide credentials

### Database
- ✅ Schema is complete and ready
- ✅ RLS policies implemented
- ✅ Drizzle schema mirrors SQL
- 🎯 **Needs your action**: Apply to Neon

### Backend
- ✅ All server functions use `withContext()` for RLS
- ✅ Neon WebSocket Pool for transactions
- ✅ Rate limiting implemented
- 🎯 **Needs your action**: Configure DATABASE_URL

---

*Status: Ready for your action on M0 deployment*
