# D28: Look and feel (buttons, one tab style, wheel labels, card colours, lint warnings)

Round 10 (send ALONE, nothing else open) | Branch: `freebuff/look-and-feel` | Migration: none | Depends on: D20 to D27 all merged. This prompt restyles shared CSS and shared components, so it must not run next to another prompt.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code. For this one prompt you ARE allowed to change how existing screens look, but only in the ways listed below.

Karma's rules for this prompt:
- Fix live AND demo. Every screen exists in live mode and most also in demo mode. Anything you restyle must be restyled in both. In the handoff say, per item, "live done / demo done" or why one does not apply.
- Be thorough and detailed. Size is not a problem. Every item gets a test.
- No em dashes or en dashes anywhere (the test `src/test/no-emdash.test.ts` fails the build if one appears, in code, CSS, tests or docs). Plain words for owners.
- Buttons must look like buttons and never change their label to "Saving" or "Saved". A short line under the button ("Saved.") is how success is shown.
- Do not redesign the public marketing site (`/`, `/for-business`, `/for-diners`, `/pricing`, `/how-it-works`, `/faq`, `/case-studies`, `/blog`, `/contact`, `/privacy`, `/terms`, `/consent-wording`). Karma is redesigning those himself. You may only fix a button or tab there if it breaks the rules in item 1 or 2.
- Push only to `freebuff/look-and-feel`. Never push to main. Never touch production. Never create Neon or Vercel resources.

## Goal
Every button looks like a button. There is one tab bar style across the whole product. The wheel shows prize names in full. Owners can never save a card colour pair that cannot be read. The till shows what the staff member can do next after the PIN is accepted. The lint output is clean.

## You own these files
- Shared CSS: `src/ui.css`, `src/styles.css`, `src/components/patron/kit/kit.css`, and any other `.css` file the searches below lead you to
- Tab and nav components: `src/components/patron/OwnerNav.tsx` (the `OwnerSectionTabs` part only, do not change the menu structure or the `SECTION_TABS` and `SECTION_OF` lists), `src/components/patron/LoyaltyTabs.tsx`, `src/components/patron/kit/index.tsx` (the `pk-tabs` tab component only), `src/components/patron/live/LiveInsights.tsx` (the tab bar only), `src/routes/app.customers.tsx` (the tab bar only), `src/components/patron/GuestShell.tsx` (only if its tab bar is a different style, see item 2)
- New: `src/components/patron/kit/SectionTabs.tsx` (the one shared tab bar), `src/test/look-audit.test.ts`, `tests/e2e/look-audit.spec.ts`
- Wheel: `src/components/patron/SpinWheelSvg.tsx`, `src/lib/wheel.ts`, `src/lib/wheel.test.ts`, `src/test/wheel-preview.test.tsx`
- Card colours: `src/lib/card-palettes.ts`, `src/lib/card-palettes.test.ts`, `src/components/patron/ThemeEditor.tsx`, `src/routes/app.design.tsx`, `src/theme/index.tsx` (only the contrast helpers), and the live card design tab `src/components/patron/live/LiveStampCardTab.tsx`
- Till: `src/routes/stamp.tsx`, `src/components/patron/LiveTill.tsx` (look and the "what next" panel only, no change to how stamps or redemptions are recorded)
- Lint fixes in the twelve files listed in item 6
Do not touch migrations, server code (`src/server/**`) or any `db/**` file.

## Read first
`src/ui.css` (`.builder-primary` and `.builder-secondary` near lines 112 to 145, `.loyalty-tabs` and `.loyalty-tab` near 4745, `.row-action` near 2254), `src/components/patron/kit/kit.css` (`.pk-tabs`, `.pk-tab` near 301, `.pk-button` near 124), `src/styles.css` (`.guest-tabs` near 4218, `.gx-tabs`), `src/components/patron/OwnerNav.tsx` (`OwnerSectionTabs` renders `ox-subtabs` and `ox-subtab`), `src/components/patron/LoyaltyTabs.tsx`, `tests/e2e/design-kit.spec.ts`, `tests/e2e/demo-no-scroll.spec.ts` (how the existing browser tests open every screen), AGENTS.md.

## Item 1: every button looks like a button

Today some buttons are plain text or very faint, so an owner cannot tell they can be pressed. Fix this once, with a rule and a test, not screen by screen by hand.

1. Decide the allowed button looks and write them in one comment block at the top of `src/components/patron/kit/kit.css`:
   - Primary (the main action on a screen): class `builder-primary` or `pk-button` (primary variant). Filled with the main colour, white text, minimum height 44px, rounded.
   - Secondary: class `builder-secondary` or `pk-button` (secondary variant). Visible 1.5px border and readable text, minimum height 44px.
   - Small row actions inside tables and lists: class `row-action`. Must have a visible border or background and a minimum height of 32px. Never plain text with no border.
   - Danger actions (delete, reject, remove): use the secondary look with a red border and red text, and a confirm step. Do not invent a third family.
   - Links that open another page may look like links, but a link that performs an action (Approve, Send, Publish) must be a button.
2. Write a browser audit in `tests/e2e/look-audit.spec.ts` that opens every owner, guest, till (staff) and operator screen in demo mode (use the same route list and sign-in approach as `tests/e2e/demo-no-scroll.spec.ts`; add any route that file misses, for example every `/app/*`, `/ops/*`, `/me/*`, `/stamp`, `/r/<slug>`, `/r/<slug>/join`, `/r/<slug>/card`, `/find`, `/login`, `/signup`) at widths 360, 768 and 1280. On each page, for every `button`, `[role="button"]`, `input[type="submit"]` and `a` whose text is a verb (Save, Send, Publish, Approve, Reject, Add, Remove, Redeem, Stamp, Spin, Copy, Download, Continue, Next, Back, Close and similar), assert all of these:
   - it has a visible background colour that is not transparent, OR a border of at least 1px that is not transparent;
   - its height is at least 32px (44px for primary and secondary);
   - its text colour against its own background (or the page background when it is transparent) has contrast of at least 4.5:1 (use the `contrastRatio` helper from `src/theme/index.tsx` inside the page through `page.evaluate`, or copy the formula into the spec);
   - its label is not "Saving", "Saved", "Saving...", "Saved!" or similar (`/^saved?(\.\.\.|!)?$/i` and `/^saving/i` must not match).
   Collect every failure with the page, a CSS path and the text, and fail with one readable list at the end (not at the first failure).
3. Run the audit, fix every failure by giving the element the right class or fixing the shared rule, and run it again until it is clean. Where the audit finds a legitimate icon-only button, give it an `aria-label` and a 44px square hit area and exclude it from the label rules in the spec with a one-line reason.
4. Search the whole `src` folder for buttons whose label changes while saving (`busy ? "Saving` and similar) and change them so the label stays the same (disable the button while busy; do not change the words). There are known cases in `src/components/patron/live/LiveTiersTab.tsx` and `LiveToolsTab.tsx`; find the rest with `grep -rn "Saving" src --include=*.tsx`.
5. Add a unit test `src/test/look-audit.test.ts` that reads every `.tsx` file under `src` and fails if a `<button` without any `className` (and not inside the shared `kit` or `ui` folders) appears, with the file and line in the message. Fix what it finds by giving a class, so the rule stays true for new code.

## Item 2: one tab bar style

There are five different tab bar looks today: `.loyalty-tabs` (filled terracotta pills, used on the Loyalty screens), `.pk-tabs` (cream container with a white pill for the active tab, used on Insights), `.guest-tabs` (Customers), `.ox-subtabs` (the Settings and other section tabs from `OwnerSectionTabs`) and `.gx-tabs` (the guest app bottom bar, keep that one as it is, it is a bottom navigation, not tabs).

1. Make one component `SectionTabs` in `src/components/patron/kit/SectionTabs.tsx` that renders either links (when each tab has an `href`, with `aria-current="page"` on the active one) or buttons (with `role="tablist"`, `role="tab"` and `aria-selected`), with the same look. The look is the filled terracotta pill from `.loyalty-tabs`: pill radius, 1.5px border in the border colour, active tab filled with the primary colour and white text, minimum height 40px, horizontal scroll on narrow screens instead of wrapping onto several rows, a visible keyboard focus ring.
2. Move these four to the new component and delete their old CSS: `LoyaltyTabs` (links), `OwnerSectionTabs` (links), the Insights tab bar in `LiveInsights.tsx` and the demo Insights tab bar (find it with `grep -rn "pk-tabs" src`), and the Customers tab bar in `src/routes/app.customers.tsx` (buttons or links, keep what it does). Keep every tab's label, order and destination exactly as it is today.
3. After the move, search for `.loyalty-tabs`, `.loyalty-tab`, `.pk-tabs`, `.pk-tab`, `.guest-tabs`, `.ox-subtabs`, `.ox-subtab` in all CSS, TSX and test files. Remove CSS that nothing uses any more. Update any test that looked for the old class names (a test that checks which tab is active should now look for `aria-current` or `aria-selected`).
4. Tests: a component test for `SectionTabs` (links mode and buttons mode, active state, keyboard arrows move focus between tabs in buttons mode, the tab list has an accessible name); a browser test in `tests/e2e/look-audit.spec.ts` that opens `/app/loyalty`, `/app/insights`, `/app/customers`, `/app/settings` (and the sub tabs it shows) at widths 360 and 1280 and asserts that each page has exactly one tab bar using the shared class, with no horizontal page scroll and the active tab visible without scrolling the page.

## Item 3: prize names cut short on the wheel

`SpinWheelSvg.tsx` uses `wheelLabelLines` in `src/lib/wheel.ts`, which splits a prize name into at most two short lines and the rest is cut off with no hint. Owners see "Free coffee wh" instead of "Free coffee with any meal".
1. Draw the full name. Allow up to three lines, shrink the font size for long names down to a minimum that is still readable on a phone (about 7 SVG units), and only when it still does not fit, cut at a word boundary and add "...", and keep the full text in the `<title>` of the segment and in a list under the wheel ("Prizes on this wheel") so nothing is hidden. Count how many segments there are: with 8 or more segments use a smaller font for the whole wheel instead of cutting.
2. Keep the guest spin screen, the owner preview in the Loyalty tools and the demo wheel on the same drawing code (they share `SpinWheelSvg`); check all three.
3. Tests (`src/lib/wheel.test.ts`, `src/test/wheel-preview.test.tsx`): a long prize name is shown in full in the list under the wheel; the SVG text never has more than 3 lines; the minimum font size is respected; the cut with "..." only happens beyond the limit; 2, 6 and 12 segments all render; a prize name with only one very long word is handled.

## Item 4: custom card colours that cannot be read

`src/lib/card-palettes.ts` already refuses an unreadable text and background pair (`refuseUnreadableColours`). Make sure it is enforced everywhere and that the owner is helped, not only refused.
1. Find every place an owner can pick card colours or a theme colour: the card design tab (`LiveStampCardTab.tsx`), `ThemeEditor.tsx`, `app.design.tsx`, the Your page designer (search `accent` and `color` in `src/components/patron/live/LivePage.tsx`). The refusal must happen in each of them before the save is sent and again on the server wrapper if the server code already validates colours (do not edit server code; if a server path accepts any colour, write it under "Needs from another phase" in the handoff).
2. Add to `src/lib/card-palettes.ts` a pure function `suggestReadableInk(paper: string): string` that returns the darkest or lightest of the palette inks that reaches 4.5:1 on the given paper, and `suggestReadablePaper(ink: string): string`. When a pair is refused, the message shows a "Use a readable colour" button (secondary look) that applies the suggestion in one press.
3. The live preview of the card and of the page must use the same pair that will be saved, so what the owner sees is what guests get.
4. The button text on the card (the accent colour with its label colour) must also reach 4.5:1. Add the same check for the accent against white or ink text and pick the readable one automatically in the preview.
5. Tests: `suggestReadableInk` and `suggestReadablePaper` reach 4.5:1 for 200 random colours (use a seeded generator, not `Math.random`); every preset palette passes; the unreadable pair `#cccccc` on `#ffffff` is refused with the plain message; the "Use a readable colour" button applies the suggestion and the save is then allowed; pure black on pure white and pure white on pure black pass; invalid hex strings are refused without crashing.

## Item 5: the till after the PIN check

In `src/routes/stamp.tsx` (demo) and `src/components/patron/LiveTill.tsx` (live), after a staff member signs in with their PIN, make sure the screen shows what to do next: a clear heading with the staff member's name, the scan or code box, and below it the three things staff can do after they find a guest: Add a stamp, Redeem a reward, Redeem an offer code (specials and campaign codes). Today the redeem controls are mixed in with other things and are easy to miss.
1. Group them into three plain sections with headings, each with a primary or secondary button that follows item 1, and a short line of help in plain words ("Use this when the guest shows a reward on their card.").
2. After a stamp, redeem or undo, the screen shows a green line for success or a red line for failure for at least 5 seconds, announced to screen readers (`role="status"` for success, `role="alert"` for failure), and the guest's stamp count refreshes. In live mode check that the count refreshes (the demo path calls a refresh after a stamp; make sure the live path shows the new count too, using the response that the server already returns; do not add server code).
3. The sign out button for the staff member is always visible on this screen.
4. Do not change how stamps, redemptions or undo are recorded. Do not change the PIN rules or the lockout.
5. Tests: a component test for each of the three sections being present after sign in, in demo and in live (server functions mocked); the success and error lines have the right role; the browser test in `tests/e2e/look-audit.spec.ts` signs in as the demo staff member and checks the headings and buttons exist.

## Item 6: lint warnings

`pnpm lint` shows 12 warnings today and the standard is zero. Fix them without changing behaviour:
- Eleven `react-refresh/only-export-components` warnings in `src/components/patron/OwnerNav.tsx` (line 17), `src/components/patron/dash.tsx` (87), `src/components/ui/badge.tsx` (32), `src/components/ui/button.tsx` (51), `src/components/ui/form.tsx` (163), `src/components/ui/navigation-menu.tsx` (111), `src/components/ui/sidebar.tsx` (743), `src/components/ui/toggle.tsx` (42), and `src/theme/index.tsx` (14, 16 and 26). For the shadcn style files in `src/components/ui/` move the exported variants or helpers into a sibling file (for example `button-variants.ts`) and import them back so every importer still works (search the repo for each importer and update it). For the others move the constant or function into a sibling `.ts` file (for example `owner-nav-sections.ts`) and re-export nothing from the component file. Do not add `eslint-disable` comments for this rule.
- One "unused eslint-disable directive" in `src/lib/error-log.ts` line 13: remove the directive.
- Result: `pnpm lint` prints zero warnings and zero errors. Update the baseline note in AGENTS.md or `docs/prompts/README.md` if either mentions "12 warnings".

## Not in this prompt
Redesign of the marketing pages, new features, new screens, server code, wording changes other than the ones above, colour palette changes of the product itself. Karma reviews every screen himself after this prompt, so do not try to "improve" the design beyond the list.

## Tests to run before you push
`pnpm typecheck`, `pnpm lint` (must be zero warnings), `pnpm test`, `pnpm build`, `pnpm test:e2e` (all existing browser tests plus `look-audit.spec.ts`). In the handoff paste the counts and the final audit result.

## Handoff (send these lines)
Branch and last commit, test counts, per item "live done / demo done / not applicable", the number of button failures the audit found at the start and at the end (with the screens that had the most), the list of CSS rules you deleted, the list of files that moved because of the lint fix, anything unfinished, anything that surprised you, and anything you found broken that was outside this prompt (list it only, do not fix it).
