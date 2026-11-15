# D13b2: Finish D13b: live Your page, design controls in the Stamp card tab, scan proof

Follow-up to D13b | Branch: `freebuff/card-design-finish` | Migration: none expected (0023 already exists; if you truly need a change, add `0033_logo_page_fix_dev.sql`) | Depends on: D13b (merged)

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Why this exists
D13b was merged with the logo storage, the logo route and the logo on the QR code in place, but these parts of its prompt were not finished or not proven. Read `docs/prompts/D13b-stamp-card-design-logo-qr.md` again for the detail of each item. Do not redo what already works: open each file first and finish only what is missing.

## You own these files (touch nothing else)
- `src/routes/app.page.tsx`, `src/routes/app.design.tsx`, `src/routes/app.qr.tsx`
- `src/components/patron/live/LiveStampCardTab.tsx`, `src/components/patron/ThemeEditor.tsx`, `src/components/patron/QrPrintPack.tsx`
- `src/server/live-page.ts` and its `-fns.ts` wrapper, `src/lib/live-page.ts`, `src/lib/qr.ts`, `src/lib/qr-pdf.ts`, `src/lib/logo-stamp.ts` and their tests
- `src/test/db/logo-page.db.test.ts` (new)

## Build (finish these, in this order)
1. **Your page is live.** `/app/page` in live mode loads and saves the words, the opening hours (`restaurant.hours`, with a shape check) and the other existing columns, and shows the preview of what guests see. Demo mode is untouched. A save shows a plain confirmation and the button keeps its label.
2. **Design controls beside the rules.** Put the palette, stamp icon and logo-as-stamp controls into the Stamp card tab (`LiveStampCardTab.tsx`) next to the rules, with a live preview of the guest card (stacked below on a phone). `/app/design` redirects to that tab in live mode.
3. **Logo upload screen.** Upload, replace and remove a logo in live mode. The browser converts the upload to a 512 px PNG plus a white-background print JPEG (at most 100 KB) before sending. Show the real size errors in plain words.
4. **Scan proof.** Add the test from step 4 of the D13b prompt: render the QR modules to a pixel buffer, blank the exact centre the logo covers, decode with `jsqr`, and expect the join link. Use the longest join link a slug can produce. Also confirm a plain code still decodes for every URL in `src/lib/qr.test.ts`.
5. **PDF print pack with the logo.** If `qr-pdf.ts` does not yet embed the print JPEG, do it as the D13b prompt describes (hand-written image object, no new library). If it is more than a modest amount of work, ship without it and say so under "Not verified".
6. **Real-database test** `src/test/db/logo-page.db.test.ts`: an owner can upload for their own restaurant only; over 300 KB and wrong types are refused; B cannot overwrite A's logo; a draft restaurant's logo is not readable by others; `version` changes on replace.

## Not in this phase
Suburb and category pickers (Claude wires those from D19), anything in Settings, any new migration for other features.

## Handoff
List what you finished, what you could not prove, and give the exact words of any plain-language text you added so Claude can check the tone.
