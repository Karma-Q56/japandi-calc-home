# Polish and completion pass

Working order from the brief. Stop points get noted per section.

## 0. Writing rules
- [x] Remove every em dash (U+2014) from src, docs and public.
- [x] Add a guard test scanning src, docs and public for U+2014 (src/test/no-emdash.test.ts).
- [ ] Replace jargon wording with plain South African English and add helper lines to non-obvious settings (ongoing with each section).

## 1. Page by page fix and consistency
- [x] Walk every route at 375px and 1280px (4 roles, 160 checks via the Playwright walker): zero flagged after fixes. Keep re-running the walker after big changes (script regenerated per run from /tmp/browser/walk_route.py).
- [x] Footer column alignment on mobile is correct and the floating demo pill is already hidden in production (dev-only unless ?demo=1).
- [x] Routes test added: src/test/routes-audit.test.tsx visits every page route and asserts one header, no console errors and no U+2014 (44 pages; /api, /healthz, /u/$token skipped, dev and utility pages allowlisted).
- [x] Fixed hydration mismatches: shared money formatter (src/lib/money.ts) replaces three locale-dependent Intl formatters; demo-state pages use the hydration-safe useDemoState; QR print pages are ssr:false because the QR needs the browser origin.
- [x] Fixed structure: operator pages keep the Ops nav on child routes (markOutletComponent); the venue masthead and card head are the single page header (no duplicated header elements).
- [ ] Deeper per-page review of useful content, empty states and dead links (ongoing with sections 2 to 8).

## 2. Dashboards
- [ ] One design system across owner dashboard, diner app, staff till and Patron admin (homepage style: cream, terracotta, Bricolage Grotesque, DM Sans, Lora italic accents).
- [ ] Shared component set: PageHeader, StatCard, DataTable, EmptyState, FormField, Badge, ConfirmDialog.
- [ ] Mobile first: bottom tab bar on phones, sidebar on desktop; one main action per screen.

## 3. Preview everything before publishing
- [ ] Draft, Preview, Publish states for: loyalty rules and reward triggers, stamp card design and logo stamps, public page and template, menu and items, specials, campaigns (SMS and push), spin wheels, challenges and tiers, welcome stamps.
- [ ] Guest-accurate previews: phone frame card, public page per template, SMS with character count and cost, push notification, test spin (no budget use), reward moment, "Preview only, nothing was sent".
- [ ] Publish gate plus "Preview changes" step for published items, with tests.

## 4. Content pages
- [ ] Blog index, blog post template, RSS-friendly data structure; docs/blog-plan.md with 15 topics; two clearly marked placeholder posts.
- [ ] How it works and How to guide for owners and diners with FAQ.
- [ ] Privacy policy and Terms of service, plain language South African versions; lawyer review note in docs/decisions.md.
- [ ] Pricing page with plans, SMS credit cost, monthly cost calculator, FAQ and call to action.

## 5. Owners can edit their own pages and menus
- [ ] Self-service edits: name, tagline, about, address, hours, cover photo, logo, colours, template, menu sections and items, specials, contact links, all with preview and publish.
- [ ] Validation, helpful messages, undo or restore previous version for public page and menu.

## 6. Reward triggers with presets
- [ ] Presets: number of stamps, every Nth visit, on joining, birthday week, away for days (win back), chosen quiet day, plus Custom.
- [ ] Plain wording, defaults, cost estimate, guest preview, on and off switches, one "what happens when" list, tests per preset.

## 7. More high converting loyalty tools
- [ ] Web research; pick 4 to 6 tools; document each in docs/decisions.md with source links.
- [ ] Build with owner settings, guest view, budget limits, preview and publish, consent and STOP respected, no purchase needed for prize draws.

## 8. Suggestions
- [ ] Owner Suggestions page (category, message, optional screenshot, optional contact permission) with past suggestions and status.
- [ ] "Suggest a feature" link in website footer and diner app settings, opening a public form.
- [ ] Demo store now, database table for live mode with row level security; Suggestions inbox in Patron admin with status and filter.

## 9. Finish
- [ ] Run typecheck, lint, vitest and build and report real results.
- [ ] Screenshots at 375px and 1280px of every changed page, inspected for overlaps and gaps.
- [ ] Update Tasks completed.md honestly and docs/decisions.md.

## Notes
- Git commits are managed by the platform, so section commits happen through the normal save flow.
