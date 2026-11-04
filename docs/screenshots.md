# Screenshot pass

Every route was captured at 375px and 1280px on 4 November 2026 with
`scripts/shot-verify.mjs`, signed in through `/dev/roles?role=...`.

The walk hides the demo pill and every fixed or sticky bottom bar before the
full-page shot, uses reduced motion so revealed sections are never captured
blank, waits for click navigation to finish, and writes
`screenshots/<stage>-<width>.png`. Any page taller than 1500px is also cut into
bands of at most 1500px under `screenshots/pieces/`, so every part can be
opened.

Final walk: **67 stages x 2 widths = 134 shots**, 0 failed stages, 0 console or
page errors, 0 interaction failures, and 0 pages whose document scrolls
sideways. 72 shots were taller than 1500px and produced **176 crops**.

The walker reports 42 shots with an element past the viewport. 32 are the
intended owner navigation row on the phone, which scrolls inside its own strip
under the header. The other 10 are expected: the home marquee at both widths,
hidden honeypot fields on contact, suggest, feedback and for-business, and the
for-business demo screen at 375px. Every page's `scrollWidth` stays equal to
its viewport width.

Five phone stages were rerun individually against the fresh build because the
first complete pass either timed out, missed a click, or showed the wrong tab:
owner dashboard, owner menu preview, owner specials, operator enquiries, and
till order categories. Their final shots are merged into the report above. The
menu stage now shows the guest preview inside its phone frame, and the till
stage shows Zanele at 3 of 6 with the order categories and stamp toast.

## Changed screens

I opened these full shots and bands by hand. Heights are shown as
`height / crops`.

| Screen | 375px | 1280px | What I saw |
| --- | --- | --- | --- |
| Home | 4890 / 4 | 3721 / 3 | Sentence-case hero with one italic Lora accent, search with one filled Find action, trust strip, two-sided explainer, three venue cards, outline owner call to action, FAQ heading and questions, final call to action, marquee and footer. No heavy all-caps display type or bracketed mono labels. |
| `/dev/kit` | 3963 / 3 | 3079 / 3 | Colour tokens, type stack, primary, secondary, quiet and danger buttons, fields, filter pills with counts, tabs, status pills, stat cards, page header, empty and loading states, toasts, drawer trigger, initials avatars, stamp circles and back link. Two-column fields become one column on the phone. |
| Guest card | 3048 / 3 | 2696 / 2 | Restaurant and card identity, stamp row, membership pills, welcome spin, visit challenge, QR and member code, referral, waiting rewards, offers and recent visits. The 1280 view keeps the card in a centred phone-width column. |
| Guest home | 1386 / 0 | 1263 / 0 | Restaurant identity top left, cards, offers and account links in the shared guest shell. |
| Owner dashboard | 1751 / 2 | 1248 / 0 | Logo, OWNER tag, venue switcher with three venues, account menu, horizontal phone navigation, one filled Open the till action, five figures, visit chart, next campaign and last campaign. The fifth figure sits alone in a half cell by design. |
| Owner customers | 3372 / 3 | 2969 / 2 | Search and filter pills, guest rows with stamps, last visit and reward state, and no clipped names or sideways scroll. |
| Owner menu preview | 1804 / 2 | 1514 / 2 | Draft, Preview and Publish steps, preview notice, four template pills, guest phone frame, Publish to my menu as the only filled page action, and Back to editing as an outline button. |
| Owner specials | 2204 / 2 | 1595 / 2 | Public, Members and Targeted choices, draft fields, existing live specials and a proper empty state for recent redemptions. |
| Operator enquiries | 2596 / 2 | 1415 / 0 | Operator identity, wrapped phone navigation, four figures, filters, enquiry rows, detail panel and one filled Save notes action. No missing styles or MIME errors. |
| Till sign-in | 965 / 0 | 977 / 0 | Restaurant identity top left, Staff badge, paired operator, swap and log out actions. |
| Till order categories | 2377 / 2 | 2306 / 2 | Staff shell, member lookup, Zanele at 3 of 6, one filled Add stamp action, offer field, six order categories, disabled Save order until a category is picked, stamp toast and stamped-today list. |
| Operator restaurants | 1434 / 0 | 900 / 0 | Operator navigation, one filled Add a restaurant action, responsive table with active status pills, member counts, credit and Look and feel, View page and QR actions. |
| For business | 12652 / 9 | 9006 / 7 | Long marketing page. The demo device strip is intentionally wider than the phone viewport and is flagged for that reason. |

The remaining stages were measured in the same walk. Their full shots and crops
have no console errors, no failed actions and no page-level sideways scroll.
They kept their existing layout, with only the shared kit, type, spacing and
shell changes applied.

## Browser rules

The Playwright design-kit spec passes 3 of 3:

- The kit catalogue renders every shared piece.
- Owner navigation scrolls under the header at 375px without page overflow.
- Every covered page has at most one primary action.

```text
ok 1 the design kit catalogue renders every shared piece
ok 2 owner navigation scrolls under the header at 375px without page overflow
ok 3 each covered page has at most one primary action
3 passed (1.2m)
```

## Not done by screenshot

- Real SMS delivery, email, payments and operator notifications are covered by
  domain tests, not pixels.
- The 1280 guest card intentionally stays in a phone-width column; it is not a
  desktop dashboard.
- The screenshot walk checks document width and known problem elements. It is
  not a full visual regression diff against an older build.
