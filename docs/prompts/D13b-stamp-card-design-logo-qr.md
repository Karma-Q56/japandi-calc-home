# D13b: Stamp card and design in one place, Your page, logo upload, logo on the QR code

Wave 2 (start after D12a is merged) | Branch: `freebuff/card-design-logo` | Migration: 0023 | Depends on: D12a

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
1. The stamp card rules and the card design live together in one tab with a live preview, so an owner sees the effect of every change.
2. "Your page" works for real (words and opening hours).
3. An owner can upload a logo. The logo appears on the guest card and on the QR code in the middle, when a logo exists. No logo means a plain QR code, as today.

## You own these files (touch nothing else)
- `db/migrations/0023_logo_page_dev.sql`
- `src/server/live-page.ts`, `src/server/live-logo.ts`, their `-fns.ts` wrappers, `src/lib/live-page.ts` and tests
- `src/routes/app.page.tsx`, `src/routes/app.design.tsx`, `src/routes/app.qr.tsx`
- `src/routes/r.$slug.logo.tsx` (new, serves the logo image)
- `src/components/patron/live/LiveStampCardTab.tsx` (add the design controls and the preview; D12a created it)
- `src/components/patron/ThemeEditor.tsx`, `QrPrintPack.tsx`
- `src/lib/qr.ts`, `src/lib/qr-pdf.ts`, `src/lib/logo-stamp.ts`, `src/lib/card-palettes.ts` and their tests
- `src/test/db/logo-page.db.test.ts`

## Build
1. **Logo storage, no new infrastructure.** Table `restaurant_logo` (`restaurant_id` primary key, `content_type`, `bytes bytea`, `version`, `updated_at`), tenant write policy, readable for active restaurants, app role can select, insert, update. Limits enforced in SQL: 256 KB, PNG, JPEG, WebP or SVG only. The browser downsizes the image to at most 512 px before upload. A public route `/r/<slug>/logo` serves the bytes with the right content type and long cache headers keyed by `?v=<version>`. Reject SVG that contains scripts (strip or refuse). Nothing is ever fetched from a URL the owner types.
2. **Page and design.** Port the demo "Your page" (words, opening hours, the preview of what guests see) and the card design (palette, stamp icon, uses `logo-stamp.ts` to turn the logo into the stamp icon when a logo exists) to live. Save as the existing columns allow, adding columns in 0023 with checks where needed. Move the design controls into the Stamp card tab beside the rules, with a live preview of the guest card on the side (stacked below on phone). `/app/design` should redirect to that tab in live mode.
3. **Logo on the QR code.** Extend `qrSvg` so it can place the logo in the centre. Rules so it still scans: error correction level H, logo no wider than 18 percent of the QR width, on a white rounded square with a small margin, quiet zone unchanged. If no logo, output is identical to today. Make the same change in the PDF print pack. The QR page shows the logo version when a logo exists and offers a "Use plain QR code" switch.
4. **Scan proof.** In a test, render the QR modules to a pixel buffer, blank the exact centre area the logo covers, and decode it with `jsqr` (already a dependency). It must decode to the join link. Test with the longest join link a slug can produce.
5. Owner screens in live mode only. Demo mode is untouched.

## Tests
- Real database: owner uploads for own restaurant only; over 256 KB and wrong types refused; B cannot overwrite A's logo; a draft restaurant's logo is not readable by others; version changes on replace.
- Unit and scan proof as in step 4; SVG with a script tag refused; plain QR output unchanged when there is no logo (compare with the previous output).
- Text test of the migration as AGENTS.md requires.
