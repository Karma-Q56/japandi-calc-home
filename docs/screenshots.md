# Screenshot pass

Every screen now has one current pair: a 375px phone shot and a 1280px desktop shot, both taken on 2026-11-01 with `scripts/shot-verify.mjs` (it signs in through `/dev/roles?role=...`). Every pair was opened and looked at. Problems found were fixed in code and the shot was retaken.

The walk also measures each page: every element is checked against the viewport, and the document scroll width is compared with the window width. In the final walk, 60 stages x 2 widths = 120 shots, 0 console or page errors, 0 stages with failed actions, and no page scrolls sideways at 375px.

## Fixes made during this pass

| Fix | Where |
| --- | --- |
| Menu item preview prices printed R380 for a flat white. The demo seed doubled its own rand prices. Seeded items are now R38, R24, R26, R32, R45 and R95, and a test pins them. | `src/data/seed.ts`, `src/test/menu-preview.test.tsx` |
| The public-template phone preview on the menu page overflowed its phone frame at 375px because template blocks use `92vw` widths. The frame now clips and resizes them. | `src/ui.css` |
| The audience choice card on the campaign builder could print the count twice ("3 0 guests"). The active choice now uses one `countLabel` call. | `src/routes/app.campaigns.new.tsx` |
| The walk script used field names the challenge form does not have, so its preview step filled nothing and hit 30 second timeouts. It now targets the number inputs by type and position. | `scripts/shot-verify.mjs` |

## Rows

One row per screen. "Checked" is the visual and metric check; "Fixed" names what changed this pass, or nothing.

| Screen | Files | Checked and fixed |
| --- | --- | --- |
| Owner dashboard | owner-dashboard-375.png, owner-dashboard-1280.png | Stat cards, nav and quick actions fit both widths. Nothing to fix. |
| Owner customer profile (Know your guest) | owner-customer-375.png, owner-customer-1280.png | Name, pattern card and actions checked. Plural wording already uses countLabel; nothing to fix. |
| Owner insights | owner-insights-375.png, owner-insights-1280.png | No big gaps at 375px; numbers are whole. Nothing to fix. |
| Owner customers list | owner-customers-375.png, owner-customers-1280.png | Table scrolls as designed inside its card. Nothing to fix. |
| Owner saved lists | owner-lists-375.png, owner-lists-1280.png | Empty state and rows fit. Nothing to fix. |
| Owner reports | owner-reports-375.png, owner-reports-1280.png | Numbers and tables fit. Nothing to fix. |
| Owner menu | owner-menu-375.png, owner-menu-1280.png | Fixed: seeded prices now read R38 and R24, not R380 and R300. |
| Owner menu preview step | owner-menu-preview-375.png, owner-menu-preview-1280.png | Fixed: the public page inside the phone frame no longer overflows the page at 375px. |
| Owner specials | owner-specials-375.png, owner-specials-1280.png | Cards and actions fit. Nothing to fix. |
| Owner loyalty tools | owner-loyalty-375.png, owner-loyalty-1280.png | Tools panel and card rules checked. Nothing to fix. |
| Owner loyalty preview step | owner-loyalty-preview-375.png, owner-loyalty-preview-1280.png | Preview banner and phone frame fit. Nothing to fix. |
| Owner card design | owner-design-375.png, owner-design-1280.png | Card, colours and hosts fit. Nothing to fix. |
| Owner design preview step | owner-design-preview-375.png, owner-design-preview-1280.png | Card preview fits. Nothing to fix. |
| Owner challenges | owner-challenges-375.png, owner-challenges-1280.png | List and write form fit. Nothing to fix. |
| Owner challenge preview step | owner-challenges-preview-375.png, owner-challenges-preview-1280.png | Fixed this pass: the walk now fills the form, so the shot shows the real guest preview. |
| Owner campaigns | owner-campaigns-375.png, owner-campaigns-1280.png | Campaign table fits. Nothing to fix. |
| Owner campaign builder | owner-campaign-new-375.png, owner-campaign-new-1280.png | Fixed: the "N guests" counts on audience choices now print once, singular aware. |
| Owner campaign results | owner-campaign-results-375.png, owner-campaign-results-1280.png | Result stats fit. Nothing to fix. |
| Owner credit | owner-credit-375.png, owner-credit-1280.png | Balance and top up fit. Nothing to fix. |
| Owner team | owner-team-375.png, owner-team-1280.png | Team table fits. Nothing to fix. |
| Owner QR pack | owner-qr-375.png, owner-qr-1280.png | QR cards fit. Nothing to fix. |
| Owner public page editor | owner-page-375.png, owner-page-1280.png | Version list and editor fit. Nothing to fix. |
| Owner onboarding | owner-onboarding-375.png, owner-onboarding-1280.png | Steps fit. Nothing to fix. |
| Owner audit log | owner-audit-375.png, owner-audit-1280.png | Event rows fit. Nothing to fix. |
| Owner settings | owner-settings-375.png, owner-settings-1280.png | Form fields and toggles fit. Nothing to fix. |
| Owner referrals draft | owner-referrals-draft-375.png, owner-referrals-draft-1280.png | Settings form and invite copy fit. Nothing to fix. |
| Owner referrals preview | owner-referrals-preview-375.png, owner-referrals-preview-1280.png | Banner and steps fit. Nothing to fix. |
| Owner referrals publish | owner-referrals-publish-375.png, owner-referrals-publish-1280.png | Published state fits. Nothing to fix. |
| Owner guest ideas | owner-ideas-375.png, owner-ideas-1280.png | Idea board fits. Nothing to fix. |
| Staff till sign in | till-sign-in-375.png, till-sign-in-1280.png | Pairing form fits. Demo pill sits below the button on narrow screens. Nothing to fix beyond that. |
| Staff till pair code | till-pair-375.png, till-pair-1280.png | Pair state fits. Nothing to fix. |
| Staff till order step, items | till-order-items-375.png, till-order-items-1280.png | Item picker fits its card. Nothing to fix. |
| Staff till order step, categories | till-order-categories-375.png, till-order-categories-1280.png | Simple category picker fits. Nothing to fix. |
| Guest card | guest-card-375.png, guest-card-1280.png | Stamps, double stamp day and streak panels fit. Nothing to fix. |
| Guest join, birthday step | join-birthday-375.png, join-birthday-1280.png | Birthday inputs fit. Nothing to fix. |
| Guest join, referral banner | join-referral-375.png, join-referral-1280.png | Fixed earlier this pass: the banner shows the seeded referral link. |
| Guest home (me) | me-home-375.png, me-home-1280.png | Cards and links fit. Nothing to fix. |
| Guest restaurants list | me-restaurants-375.png, me-restaurants-1280.png | Venue cards fit. Nothing to fix. |
| Guest settings, birthday field | me-settings-375.png, me-settings-1280.png | Fields fit. Nothing to fix. |
| Ops restaurants | ops-restaurants-375.png, ops-restaurants-1280.png | List fits. Nothing to fix. |
| Ops one restaurant | ops-restaurant-375.png, ops-restaurant-1280.png | Rows fit. Nothing to fix. |
| Ops look editor | ops-look-375.png, ops-look-1280.png | Theme controls fit. Nothing to fix. |
| Ops credit | ops-credit-375.png, ops-credit-1280.png | Balances and list fit. Nothing to fix. |
| Ops leads inbox | ops-leads-375.png, ops-leads-1280.png | Lead cards fit. Nothing to fix. |
| Ops outbox | ops-outbox-375.png, ops-outbox-1280.png | Message rows fit. Nothing to fix. |
| Ops guest ideas | ops-ideas-375.png, ops-ideas-1280.png | Board columns fit. Nothing to fix. |
| Site home | site-home-help-375.png, site-home-help-1280.png | The flagged tall list is the marquee ticker, which clips intentionally; the page never scrolls sideways. Nothing to fix. |
| Site pricing | site-pricing-375.png, site-pricing-1280.png | Plan cards stack and fit. Nothing to fix. |
| Site how it works | site-how-it-works-375.png, site-how-it-works-1280.png | Steps fit. Nothing to fix. |
| Site FAQ | site-faq-375.png, site-faq-1280.png | Accordion rows fit. Nothing to fix. |
| Site contact | site-contact-375.png, site-contact-1280.png | The only off-screen item is the hidden honeypot field, which is deliberate anti-spam. Nothing to fix. |
| Site for business | site-for-business-375.png, site-for-business-1280.png | The three screens form a snap scroll strip on phones by design; doc scroll width stays 375. Nothing to fix. |
| Site for diners | site-for-diners-375.png, site-for-diners-1280.png | Sections fit. Nothing to fix. |
| Site blog list | site-blog-375.png, site-blog-1280.png | Post cards fit. Nothing to fix. |
| Site blog post | site-blog-post-375.png, site-blog-post-1280.png | Copy fits. Nothing to fix. |
| Site find | site-find-375.png, site-find-1280.png | Search rows fit. Nothing to fix. |
| Site suggest | site-suggest-375.png, site-suggest-1280.png | Honeypot only is off screen. Nothing to fix. |
| Site login | site-login-375.png, site-login-1280.png | Form fits. Nothing to fix. |
| Site privacy | site-privacy-375.png, site-privacy-1280.png | Copy fits. Nothing to fix. |
| Site terms | site-terms-375.png, site-terms-1280.png | Copy fits. Nothing to fix. |

## Not done by screenshot

- Real SMS delivery and operator notifications are noticed in text, not pixel state, so they stay covered by the domain tests instead.
- The fullPage shots pin sticky bars (the demo pill and the owner bottom nav) at one spot mid page. That is how fullPage capture handles sticky elements; the live page is not affected.
