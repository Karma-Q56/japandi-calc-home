# ACTION ITEMS - Comprehensive Task List

This file contains ALL action items needed to complete the Patron platform, organized by milestone and priority.
Each item references its source milestone from BUILD_PLAN.md and SPEC.md.

---

## 📋 HOW TO USE THIS FILE

1. **For You (Founder)**: Review items marked with 🎯 to understand what you need to provide
2. **For Development**: Work through items in order, checking them off as complete
3. **References**: Each item links to its source in BUILD_PLAN.md (M0, M1, etc.) or SPEC.md (§ section)

---

## 🎯 YOUR ACTION ITEMS (Requires Your Input - BLOCKING)

### Immediate (Before Development Can Complete)
- [ ] **Apply database schema to Neon** (M0, §8)
  - Run: `psql $DATABASE_URL_MIGRATE -f db/schema.sql`
  - Verify all tables and functions are created
  - Test RLS policies work correctly
  
- [ ] **Configure environment variables** (M0, §13)
  - Create `.dev.vars` file with all required variables
  - Required variables listed in `.env.example`

- [ ] **Set up Cloudflare Workers** (M0, §3.1)
  - Configure Wrangler with your Cloudflare account
  - Set up staging environment

- [ ] **Provide WhatsApp number** (Marketing Site, SPEC §2)
  - Update `contact.whatsappNumber` in `src/lib/patron.ts`
  - Used for "Book a visit" buttons and lead follow-ups

- [ ] **Set final product name** (SPEC §17.1)
  - Currently using "Patron" as placeholder
  - Update `APP_NAME` in `src/config/app.ts` and `brand.name` in `src/lib/patron.ts`

- [ ] **Define plan pricing** (SPEC §17.2)
  - Update `plans` array in `src/lib/patron.ts`
  - Update `plannerPlans` for calculator

- [ ] **Choose SMS provider** (M6, §9.1 [UNVERIFIED])
  - Evaluate: SMSFlow (~14c), WinSMS (~R0.18-0.29), Plivo, Telnyx
  - Test with your phone number
  - Document decision in `docs/decisions.md`

### Before Launch (Legal & Operations)
- [ ] **Legal review of consent wording** (SPEC §12.13, §17.10)
  - Review `src/config/consent.ts`
  - Ensure POPIA compliance
  - Have South African lawyer review

- [ ] **Set data retention period** (SPEC §17.7)
  - Update retention logic in nightly cron
  - Default inactive period: 24 months

- [ ] **Decide on OTP cost handling** (SPEC §17.8)
  - Absorbed by Patron (current) or charged to restaurant?
  - Update `SMS.otpCostCents` in `src/config/app.ts`

- [ ] **Set up backup storage** (SPEC §17.6)
  - Decide where nightly dumps live (R2, S3, GitHub artifacts)
  - Configure backup script

---

## 🚀 DEVELOPMENT ACTION ITEMS

### M0 - Foundation (Infrastructure) ✅
Reference: BUILD_PLAN.md M0, SPEC.md §3, §8

**All M0 items are COMPLETE and ready for your Neon deployment**

- [x] Database schema (`db/schema.sql`) with full schema
- [x] Drizzle schema (`src/server/db/schema.ts`)
- [x] `withContext()` implementation for tenant-aware transactions
- [x] Health check endpoints (`/healthz`, `/healthz/db`)
- [x] All package.json scripts configured
- [x] Test infrastructure (Vitest, Playwright)
- [x] CI workflow setup
- [x] `.env.example` with all variables

**To Complete M0:**
1. Apply schema to Neon
2. Deploy to staging
3. Measure and record latency in `docs/decisions.md`

---

### M1 - Marketing Site Upgrade and Lead Capture
Reference: BUILD_PLAN.md M1, SPEC.md §2, §10

#### Lead Capture
- [x] LeadForm component with Zod validation
- [x] Honeypot field implementation
- [x] IP rate limiting (6 submissions per minute per IP)
- [x] Server function `lead.submit` with database writes
- [x] Consent version tracking
- [ ] **Fix TypeScript errors in LeadForm**
  - Type the server function return values properly
  - Ensure form data types match server expectations
- [ ] **Test lead submission end-to-end**
  - Verify honeypot works
  - Verify rate limiting (6 per minute per IP)
  - Verify lead appears in database
  - Verify consent version stored

#### Planner Calculator
- [x] Planner calculations implementation
- [x] Unit tests for all calculations
- [x] Reference calculation verified (R160/250/3%/35%/R1,200 → 7.5, 32.5, R5,200, R1,820, R620, break-even ~4.9)
- [ ] **Integrate planner into marketing site**
  - Connect calculator inputs to lead form
  - Display results dynamically

#### Marketing Pages
- [x] Marketing site preserved from original
- [ ] **Verify pre-rendering** (M1 Acceptance)
  - Marketing pages should use no DB queries
  - Check server logs for DB access on page load

#### Ops Console
- [x] `/ops/leads` page structure
- [ ] **Complete lead listing**
  - Pagination
  - Search functionality
  - Status filtering
  - WhatsApp link generation for each lead
- [ ] **Test lead management**
  - Create test leads
  - Verify listing, search, filtering work
  - Verify status updates

---

### M2 - Restaurants, Onboarding, Public Page, Menu, QR
Reference: BUILD_PLAN.md M2, SPEC.md §2, §4, §6, §7

#### Restaurant Management
- [x] Restaurant schema in Drizzle
- [x] Server functions for restaurant CRUD
- [ ] **Complete restaurant creation flow**
  - Slug generation and validation
  - Default values
  - Organization linking (when Better Auth is ready)

- [ ] **Implement onboarding wizard** (`/ops/restaurants/new`)
  - Multi-step form for restaurant details
  - Owner invite by phone
  - Better Auth organization creation placeholder

- [ ] **Test restaurant creation** (M2 Acceptance)
  - Create "Test Cafe"
  - Verify all fields saved correctly
  - Verify slug is unique and valid

#### Public Pages
- [x] `/r/:slug` page structure
- [ ] **Complete public page**
  - Fetch and display restaurant info from database
  - Show menu sections and items
  - Show specials
  - Join button with proper linking
  - Stamp card preview

- [ ] **Test public page** (M2 Acceptance)
  - `/r/test-cafe` loads correctly
  - Menu and specials display
  - Works at 360px and 390px
  - Join button works

#### Menu Management
- [x] Menu server functions structure
- [ ] **Complete menu CRUD**
  - Create/read/update/delete sections
  - Create/read/update/delete items
  - Sort order management
  - Price formatting (ZAR)

- [ ] **Test menu management** (M2 Acceptance)
  - Create menu sections and items
  - Verify they appear on public page
  - Verify edits appear within one refresh

#### QR Generation
- [x] QR generation function
- [ ] **Implement QR code display**
  - Generate in browser (no server-side)
  - Display for restaurant page
  - Display for member cards

- [ ] **Implement printable QR posters** (`/app/qr`)
  - A4 PDF generation in browser
  - Table tents
  - Multiple size variants

- [ ] **Test QR codes** (M2 Acceptance)
  - QR scans with phone camera
  - Opens `/r/:slug/join?src=qr`
  - Member QR opens card

---

### M3 - Guest Join, Card, My Cards, Consent, Opt-out
Reference: BUILD_PLAN.md M3, SPEC.md §5

#### Join Flow
- [x] Join flow UI structure
- [x] Member server functions structure
- [ ] **Complete phone normalization**
  - Test all formats: +27821234567, 0821234567, 821234567
  - Test validation for SA mobile numbers
  - Reject landlines

- [ ] **Implement OTP flow**
  - Generate OTP (6 digits)
  - Send via ConsoleSmsProvider (dev) or real provider (prod)
  - Verify OTP
  - Rate limiting (3 per 15 min per phone, 10 per day)

- [ ] **Complete join database operations**
  - Check/create customer (by phone)
  - Create membership
  - Store consent events with exact wording
  - Generate QR token
  - Handle existing members (same phone, different restaurant)

- [ ] **Test join flow** (M3 Acceptance)
  - Join with `082 123 4567` and `+27821234567` → same customer
  - Second restaurant adds second membership (not duplicate customer)
  - Marketing consent unticked by default
  - Rate limits: 4th OTP request in 15 minutes refused

#### Card Display
- [x] Card display UI structure
- [ ] **Complete card data fetching**
  - Get membership by customer and restaurant
  - Get stamps for membership
  - Get rewards for membership
  - Get restaurant info

- [ ] **Implement stamp grid**
  - Display stamps_required slots
  - Show filled stamps
  - Animate new stamps (when stamps increased since last view)

- [ ] **Implement member code**
  - Generate QR code in browser (using qrcode library or API)
  - Display 8-char human code (base32, no 0/O/1/I)
  - Rotate on demand

- [ ] **Test card display** (M3 Acceptance)
  - Stamp grid shows correctly
  - Member code displays and is scannable
  - Rewards show when earned
  - History displays last 20 stamps

#### My Cards
- [x] My cards page structure
- [ ] **Complete my cards data**
  - List all memberships for current customer
  - Show progress for each
  - Sort by last visit (newest first)
  - Pin rewards-ready cards first

- [ ] **Test my cards** (M3 Acceptance)
  - Shows all joined restaurants
  - Progress bars work
  - Navigation to individual cards works

#### Consent Management
- [x] Consent configuration with versioning
- [x] setConsent server function structure
- [ ] **Implement consent UI in card settings**
  - Toggle marketing SMS on/off per restaurant
  - Toggle marketing push on/off per restaurant
  - Show consent history (from consent_event table)

- [ ] **Test consent** (M3 Acceptance)
  - Withdrawing writes consent_event with action='withdrawn'
  - Marketing consent unticked by default on join
  - History preserved (insert-only)

#### Opt-Out
- [x] Opt-out page structure
- [ ] **Implement opt-out token generation**
  - Sign membership_id + purpose using HMAC-SHA256
  - Use OPT_OUT_SIGNING_SECRET from config
  - Single-use tokens
  - Store in one_time_code table or similar

- [ ] **Implement opt-out processing**
  - Verify token signature
  - Withdraw marketing_sms consent for that membership
  - Write consent_event with source='opt_out_link'
  - Show confirmation
  - No login required

- [ ] **Test opt-out** (M3 Acceptance)
  - Valid token withdraws and confirms
  - Tampered token fails gracefully
  - No login required
  - Works from SMS link

---

## 📊 TESTING ACTION ITEMS

### Unit Tests
- [x] Planner calculations
- [x] SMS segment counting
- [ ] Phone normalization (all SA formats)
- [ ] Money formatting (ZAR)
- [ ] Rate limiting logic
- [ ] Consent version management

### Database Tests
- [ ] record_stamp function (stamped, too_soon, duplicate_retry, reward)
- [ ] Ledger invariants (sum ≥ 0)
- [ ] RLS isolation (cross-tenant test)
- [ ] Unique constraints

### Integration Tests
- [ ] Server functions with ConsoleSmsProvider
- [ ] Campaign pipeline end-to-end
- [ ] Consent withdrawn mid-send
- [ ] Insufficient credit handling
- [ ] Provider failure handling
- [ ] Duplicate webhook handling

### E2E Tests (Playwright)
- [ ] Guest join → stamp by staff → reward
- [ ] Owner sends campaign
- [ ] Opt-out link
- [ ] PWA manifest per restaurant
- [ ] 360px and 390px viewports (no horizontal scroll)
- [ ] Reduced motion compatibility

### Manual Tests
- [ ] One Android Chrome phone
- [ ] One iPhone Safari
- [ ] Install PWA
- [ ] Push notifications (when implemented)
- [ ] Handoff token (when implemented)
- [ ] QR scanned from printed card

---

## 📚 DOCUMENTATION ACTION ITEMS

### Decisions (docs/decisions.md)
- [ ] **Document Neon role creation result** (M0, [UNVERIFIED])
  - Can we create app_user role on Neon free plan?
  - If not, document fallback approach

- [ ] **Document SMS provider choice** (M6, [UNVERIFIED])
  - Which provider selected and why
  - Pricing, features, limitations

- [ ] **Document latency measurements** (M0)
  - Worker to Neon round-trip latency
  - Worker CPU time for /healthz/db

- [ ] **Document iOS handoff token result** (M8, [UNVERIFIED])
  - Does handoff token work on iPhone?
  - Fallback approach if not

- [ ] **Document backup storage location** (M9, [DECISION])
  - Where nightly dumps are stored
  - Retention policy

### Updates
- [ ] **Update SPEC.md** if any behavior changed during implementation
- [ ] **Update .env.example** if new environment variables added
- [ ] **Update AGENTS.md** if any coding rules changed

---

## 🔄 RECURRING/ONGOING ACTION ITEMS

### Before Each Merge
- [ ] Run `pnpm run typecheck` - must pass
- [ ] Run `pnpm run lint` - must pass
- [ ] Run `pnpm run test` - must pass
- [ ] Verify CI is green
- [ ] Update this ACTION_ITEMS.md file

### Before Each Deployment
- [ ] Verify database migrations are applied
- [ ] Check all environment variables are set
- [ ] Test health checks (/healthz, /healthz/db)
- [ ] Verify no secrets in code
- [ ] Measure and record performance metrics

---

## 🎯 PRIORITY ORDER

### Phase 1: MVP (Get First Restaurant Live) - START HERE
1. **YOUR ACTION**: Apply schema to Neon, configure env vars
2. **M1**: Fix LeadForm TypeScript, test lead submission end-to-end
3. **M1**: Verify marketing site pre-renders without DB
4. **M2**: Complete restaurant creation, public page
5. **M2**: Complete menu management
6. **M2**: Implement QR generation
7. **M3**: Complete join flow with real database
8. **M3**: Complete card display
9. **M3**: Complete my cards page
10. **M3**: Implement consent management
11. **M3**: Implement opt-out

### Phase 2: Owner Experience
12. **M4**: Implement till pairing and PIN authentication
13. **M4**: Implement stamping flow
14. **M5**: Complete owner dashboard
15. **M6**: Complete credit ledger
16. **M6**: Choose and integrate SMS provider

### Phase 3: Advanced Features
17. **M7**: Complete campaigns
18. **M8**: Complete PWA and push notifications
19. **M9**: Complete hardening and launch checklist

---

## 📝 MILESTONE REFERENCE

| Milestone | Description | Estimated Time | Status |
|-----------|-------------|---------------|--------|
| M0 | Foundation | 1-2 days | ✅ Ready for your action |
| M1 | Marketing & Leads | 1-2 days | ⚠️ Needs TypeScript fixes |
| M2 | Restaurants & Onboarding | 2-3 days | ⚠️ Needs database integration |
| M3 | Guest Join & Cards | 3-4 days | ⚠️ Needs database integration |
| M4 | Staff Stamping | 2-3 days | ❌ Not started |
| M5 | Owner Dashboard | 2-3 days | ❌ Not started |
| M6 | Credit & SMS | 2-3 days | ❌ Not started |
| M7 | Campaigns | 3-4 days | ❌ Not started |
| M8 | PWA & Push | 2-3 days | ❌ Not started |
| M9 | Hardening | 4-5 days | ❌ Not started |

---

## 🏷️ TAGS LEGEND

- 🎯 = **YOUR ACTION REQUIRED** - Blocking development
- 🔴 = Critical blocking issue
- 🟡 = High priority
- 🟢 = Medium priority  
- ⚠️ = Has dependencies on other items
- ✅ = Complete
- 📋 = Documentation task
- 🧪 = Testing task
- 📊 = Acceptance test from BUILD_PLAN.md

---

## 📞 QUICK START

To get the first milestone (M1) working:

1. **You do this:**
   ```bash
   # Apply database to Neon
   psql $DATABASE_URL_MIGRATE -f db/schema.sql
   
   # Create .dev.vars with your config
   cp .env.example .dev.vars
   # Edit .dev.vars with your actual values
   ```

2. **Then I'll complete:**
   - Fix TypeScript errors in LeadForm
   - Connect lead submission to your database
   - Test end-to-end

3. **Verify:**
   - Submit a test lead
   - Check it appears in `/ops/leads`
   - Verify rate limiting works

---

*Last updated: Ready for your action on M0 deployment*
