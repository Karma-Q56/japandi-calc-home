# Screenshot pass

Every page was captured at 375px and 1280px on 2 November 2026 with
`scripts/shot-verify.mjs`, signed in through `/dev/roles?role=...`.

The walk now hides the demo pill and every fixed or sticky bottom bar before the
full-page shot, waits for any click navigation to finish, and writes
`screenshots/<stage>-<width>.png`. Any page taller than 1500px is also cut into
bands of at most 1500px under `screenshots/pieces/`, so every part can be
opened.

Final walk: **66 stages x 2 widths = 132 shots**, 0 failed stages, 0 console or
page errors, and 0 pages whose document scrolls sideways. 69 of the shots were
taller than 1500px and produced **167 crops**. The only elements reported past
the viewport are deliberate: the honeypot field (hidden anti-spam field), the
home marquee ticker, and the for-business snap strip on phones. Each page's
scroll width stays at the viewport width.

## Changed screens

Opened as full shots and crops on 2 November. Heights are at 375px unless
stated.

| Screen | Height / crops | What the crops show |
| --- | --- | --- |
| Owner customer profile | 2286 / 2 | Crop 1: header, one row of three stat cards, both actions, Message starters. Crop 2: Contact, birthday line, Know your guest sentence ("Thandi usually comes in on Thursday mornings and usually has a flat white. They have 0 stamps on their card, and their birthday is 1 October."), visit timeline, rewards, and the new empty state on Consent history. |
| Owner customers list | 3344 / 3 | Crop 1: heading, Export CSV, search and filters. Crops 2 and 3: 20 guest rows, every name in first name plus initial form (James M., Sipho M., Thandi N., Naledi N.), with stamps, last visit and reward pill. No duplicate first names without an initial. |
| Owner loyalty, Rewards tab | 1881 / 2 | Four tabs wrap three plus one on the phone, no sideways scroll. Draft, Preview and Publish steps are visible. Crop 2: card rules with collapsed preset sections, so the page is short. |
| Owner loyalty, Preview step | 2637 / 2 | Preview banner and phone frame. Slightly over 2,500px because the whole card preview is shown; no overflow. |
| Owner loyalty, Loyalty tools | 1084 / 1 | One helper style, preset details collapsed. |
| Owner loyalty, Spin wheel | 2519 / 2 | Tab is 2,519px. The prize list scrolls inside its own panel so the page stays near 2,500px. |
| Owner loyalty, Tiers and challenges | 1024 / 1 | Short tab, no empty gap under the heading. |
| Guest card | 3046 / 3 | Crop 1: card, stamps, tiers, welcome spin. Crop 2: QR, Bring a friend, rewards. Crop 3: offers, real buttons for Menu and specials, All restaurants, Notifications and details, then recent visits. Nothing is covered by a fixed bar. |
| Till order step, items | 2 | Demo pill and fixed bar are gone, so the Offer code field and Undo last stamp (now a secondary button) are fully visible. Nothing overlaps. |
| Owner public page | 2642 / 2 | Crop 1: words and the first opening-hours rows. Crop 2: remaining days, Preview button. Day labels and time fields are tight at 375px but readable. The version list appears below once a version exists. |
| Owner menu | 2 | Menu rows, preview form, and the new Previous versions panel. With no publishes yet it shows "No published menu yet. Publish an item to start." |
| Owner feedback | 2 | Form with category, note, picture, contact tick box, and Your past feedback with Planned and Done status pills. |
| Ops feedback | 2 | Operator nav includes Feedback; filters, four seeded notes and the open-note panel with status and private note. |
| Blog post | 2 | "Placeholder draft, not final" banner above the title. |

The remaining screens kept their existing layout; their full shots and crops
were measured in the same walk (no console errors, no sideways scroll) but were
not opened again by hand this pass. Nothing in their code changed except shared
spacing, helper text and guest names.

## Fixes made during this pass

| Fix | Where |
| --- | --- |
| The demo pill and fixed bottom bars covered real content in full-page shots. They are hidden for the capture, and clicks that navigate no longer abort the walk. | `scripts/shot-verify.mjs` |
| Tall pages were unreadable in one image. They are now cut into 1500px bands. | `scripts/shot-verify.mjs` |
| The loyalty tabs ran past the phone edge. They wrap at 700px. | `src/ui.css` |
| The spin wheel tab was 3,784px. The prize list scrolls inside its panel, bringing the tab to 2,519px. | `src/ui.css` |
| "Know your guest" repeated the name and said "has flat white". One sentence now, name once, then "they". | `src/domain/customers.ts` |
| Guest names in owner lists showed the full name twice in Insights. Lists now use first name plus last initial, including names that end in a number. | `src/lib/wording.ts`, `src/domain/insights.ts`, `src/domain/campaigns.ts` |
| The guest profile stat cards wrapped two plus one. They sit in one row, or one column below 340px. | `src/components/patron/dash.tsx`, `src/ui.css` |
| Plain text acted as buttons on the guest card and till. They are the shared button styles now. | `src/routes/r.$slug.card.tsx`, `src/routes/r.$slug.join.tsx`, `src/routes/stamp.tsx` |

## Browser page audit

`scripts/audit-pages.mjs` opens every page route in a real Chromium browser,
375px and 1280px, each page in a fresh session signed in through `/dev/roles`.
It reports console errors, links that answer 404, pages with no content and no
empty state, pages with more than one `h1`, text styled as a button that is not
one, and buttons that produce no DOM change.

```bash
AUDIT_BASE=http://127.0.0.1:5174 node scripts/audit-pages.mjs
AUDIT_BASE=http://127.0.0.1:5174 AUDIT_ONLY=owner node scripts/audit-pages.mjs
```

Results on 2 November: owner 48 pages, public plus operator 46 pages, guest and
staff 10 pages. No console errors, no 404 links, no double headers, no empty
page without an empty state and no fake buttons. The only notes were buttons
with no visible change in 250ms. They were already-selected options, the
first-row move arrow, the browser print dialog, and the pricing day picker on
its default day. All are expected. Two real problems found earlier in the audit
were fixed: the QR pack read `window.location.origin` during the first render
(hydration mismatch), and the activity log printed times without the
Johannesburg timezone.

## Not done by screenshot

- Real SMS delivery, email and operator notifications are covered by domain
  tests, not pixels.
- The audit's button check is a 250ms heuristic; a slow modal or an external
  dialog can land after the window.
