# Polish and completion pass

Working order from the brief. Stop points get noted per section.

## 0. Writing rules
- [x] Remove every em dash (U+2014) from src, docs and public.
- [x] Add a guard test scanning src, docs and public for U+2014 (src/test/no-emdash.test.ts).
- [x] Plain South African English with helper lines on non-obvious settings (one helper line per FormField hint; kept in mind for every new screen).

## 1. Page by page fix and consistency
- [x] Walk every route at 375px and 1280px. The current walker is scripts/shot-verify.mjs (60 stages, both widths, DOM measurements and console checks). Final walk on 2026-11-01: 120 shots, 0 errors. Results in docs/screenshots.md.
- [x] Footer column alignment on mobile is correct and the floating demo pill is already hidden in production (dev-only unless ?demo=1).
- [x] Routes test added: src/test/routes-audit.test.tsx visits every page route and asserts one header, no console errors and no U+2014 (44 pages; /api, /healthz, /u/$token skipped, dev and utility pages allowlisted).
- [x] Fixed hydration mismatches: shared money formatter (src/lib/money.ts) replaces three locale-dependent Intl formatters; demo-state pages use the hydration-safe useDemoState; QR print pages are ssr:false because the QR needs the browser origin.
- [x] Fixed structure: operator pages keep the Ops nav on child routes (markOutletComponent); the venue masthead and card head are the single page header (no duplicated header elements).
- [x] Per-page review of useful content, empty states and dead links: every screen in docs/screenshots.md was looked at, and the internal link audit (scripts/link-audit.mjs plus src/test/link-audit.test.ts) fails on any internal link without a matching route.

## 2. Dashboards
- [x] Shared component set: PageHeader, StatCard, StatGrid, DataTable, EmptyState, FormField, Badge, ConfirmDialog and PreviewBanner in src/components/patron/dash.tsx, styled on the existing ui.css tokens.
- [x] One design system across owner dashboard, diner app, staff till and Patron admin (cream, terracotta, Bricolage Grotesque, DM Sans, Lora italic accents). The kit is applied to every owner, diner, till and ops screen; no one-off styling.
- [x] Mobile first: bottom tab bar on phones, side rail on desktop, one main action per screen; rechecked on the 2026-11-01 walk.

## 3. Preview everything before publishing
- [x] Campaigns (SMS and push): draft, preview, cost, publish with the "Preview only" banner, segment count and cost; results page marks running totals as not final until settled.
- [x] Draft, Preview, Publish for loyalty rules, loyalty tools and presets, stamp card design, public page and template, menu items, specials, spin wheels, challenges, welcome stamps, referrals, using src/domain/publish.ts.
- [x] Guest-accurate previews: phone frame card, public page per template, SMS and push previews, test spin (no budget use), reward moment, referral banner.
- [x] "Preview changes" step for published items, with tests in src/test/publish.test.ts.

## 4. Content pages
- [x] Blog index, three posts at /blog/{slug}, RSS at /blog/rss, data in src/data/blog.ts, plan for the next notes in docs/blog-plan.md.
- [x] How it works and the FAQ page, plain language for owners and diners.
- [x] Privacy policy and Terms of service, plain language South African versions, with the birthdays, visit patterns and orders sections; lawyer review note in docs/decisions.md under Before launch.
- [x] Pricing page with plans, SMS credit cost, monthly cost calculator, FAQ and call to action.

## 5. Owners can edit their own pages and menus
- [x] Self-service edits: name, tagline, about, address, hours, cover photo, logo, colours, template, menu sections and items, specials, contact links, all through Draft, Preview, Publish.
- [x] Validation, helpful messages and version history for the public page and menu, plus restore through the publish state machine.

## 6. Reward triggers with presets
- [x] Presets at /app/loyalty: the miss-you rule and hand-out rewards beside the loyalty tools panel, in the shared Draft, Preview, Publish flow.
- [x] Plain wording, defaults, cost estimate, guest preview, on and off switches, tests per preset.

## 7. More high converting loyalty tools
- [x] Researched 6 tools with sources in docs/decisions.md; built double stamp day, visit streak, monthly bonus budget, plus the birthday reward and bring a friend that were already shipped, all with owner settings, guest views, budget limits and preview and publish.

## 8. Guest ideas (renamed from Suggestions so code never clashes with src/domain/suggestions.ts)
- [x] Guests ask for a place or a feature on their card; owners see the board with counts at /app/ideas; Patron staff see the inbox at /ops/ideas, with status changes and tests.
- [x] Public ask surface linked from the footer and diner app.
- [x] Demo repo now; live-mode table written as db/migrations/0005_ideas_dev.sql. Marks: not run against live Postgres.

## 9. Finish
- [x] Run typecheck, lint, vitest and build and report real results (numbers in Tasks completed.md).
- [x] Screenshots at 375px and 1280px of every changed page, inspected for overlaps and gaps (docs/screenshots.md).
- [x] Update Tasks completed.md honestly and docs/decisions.md.

## Notes
- Commits go through the normal save flow on branch freebuff/b8bfff140b08360ec8ca4786.
- Campaign results page: /app/campaigns/:id shows messages sent, delivery per guest, redemptions and total cost; seed messages now belong to campaign-1 so the page shows real rows in demo mode.

---

## 2 November 2026

Done and verified in this branch: the visual pass (screenshot capture, guest
sentence, names, spacing, plain wording, loyalty tabs, real buttons), restore a
previous page or menu version as a draft, the Feedback feature on owner, public
and operator screens with its dev migration, blog placeholder banners and clean
copy, and the browser page audit.

Still open: run `0006_feedback_dev.sql` on a development database; real SMS,
email and production sign-in remain out of scope for the demo.

## 2 November 2026, Phase D2

The owner overview and `/me` guest cards now read real Postgres rows through the
session viewer. Other owner tools show a "comes next" panel in live mode, and
the guest restaurant and settings routes return to `/me` until D3. The live
query path is written and typechecked, but not run against the dev database.

## 2 November 2026, Phase D3

The owner guest list and campaign history now read live Postgres rows, with the
guest search, filters and sorting covered by tests. Profiles, exports, campaign
details and all builders remain next-phase work, so live links do not expose
demo data. The live queries are written and typechecked, not run against the
dev database.

## 2 November 2026, Phase D4

Customer profiles and campaign results now open real Postgres data from the live
guest and campaign lists. Both are read only: manual stamps, consent changes,
phone reveal, export, approve, send, settle and cancel are next. The live queries
are typechecked and built, not run against the dev database.

## 2 November 2026, Phase D5

Live owners can now change SMS consent, reveal a phone with an audit event,
approve a pending campaign and cancel a scheduled campaign. Cancelling releases
the reservation and skips queued messages. Sending, settling, manual stamps and
the builders stay for D6. The mutations are typechecked and built, not run
against the dev database.

## 2 November 2026, Phase D6

The loyalty screen now has a live branch for the core card rules: stamps needed,
reward, visit window, welcome stamp and message caps. Saves validate, audit and
apply immediately. Menu, page and operator builders stay for D7 because they
need draft storage. The live path is typechecked and built, not run against the
dev database.

## 2 November 2026, Phase D7

The menu screen now has a live builder for sections, items and visibility, with
server validation and audit events. Changes apply directly. Menu drafts and
versions, the page builder and the operator console stay for D8 because they
need more storage and cross-tenant views. The live path is typechecked and
built, not run against the dev database.

## 3 November 2026, Prompt E

SMS consent is now withdrawal only: owners can take consent away, but cannot
put it back, and a repeat withdrawal is idempotent. The migration set is
recorded on the non-production Neon branch, and feedback owners can read their
own safe columns without reading the private operator note or changing status.
The guarded live suite covers the current reads, writes, cross-restaurant
access and feedback privacy. Typecheck, lint, the full test suite and the
production build pass.
