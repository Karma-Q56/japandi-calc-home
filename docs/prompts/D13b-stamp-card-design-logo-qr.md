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
- `src/lib/qr.ts`, `src/lib/qr-pdf.ts`, `src/lib/qr-links.ts`, `src/lib/logo-stamp.ts`, `src/lib/card-palettes.ts`, `package.json` and the lock file (only to add the pinned QR encoder) and their tests
- `src/test/db/logo-page.db.test.ts`

## Build
1. **Logo storage, no new infrastructure.** Reuse `validateLogoFile`, `LOGO_MAX_BYTES` (300 KB) and `LOGO_TYPES` from `src/lib/logo-stamp.ts`. The browser converts every upload (PNG, JPEG or SVG; an SVG is drawn onto a canvas) into a 512 px PNG, plus a white-background JPEG for printing (at most 100 KB), then uploads both. The server stores only those two images and never handles SVG or scripts. Table `restaurant_logo` (`restaurant_id` primary key, `png bytea`, `print_jpeg bytea`, `version`, `updated_at`), tenant write policy, readable for active restaurants, app role can select, insert, update. Limits enforced in SQL (`octet_length`) and in the server, which also checks the PNG and JPEG file signatures. A public route `/r/<slug>/logo` serves the PNG with the right content type and long cache headers keyed by `?v=<version>`. Nothing is ever fetched from a URL the owner types.
2. **Page and design.** Port the demo "Your page" (words, opening hours, the preview of what guests see) and the card design (palette, stamp icon, uses `logo-stamp.ts` to turn the logo into the stamp icon when a logo exists) to live. Opening hours already have a column (`restaurant.hours jsonb`): use it, with a shape check. Save to the other existing columns where they fit, adding columns in 0023 with checks where needed. Move the design controls into the Stamp card tab beside the rules, with a live preview of the guest card on the side (stacked below on phone). `/app/design` should redirect to that tab in live mode.
3. **Logo on the QR code.** Important: `src/lib/qr.ts` is a hand-written encoder that only supports versions 1 to 5 and error correction level L, and throws "too long" past about 106 bytes. A logo needs error correction level H, which holds far fewer bytes per version, so larger versions are needed. Replace the inside of `qr.ts` with a small, well-known, MIT-licensed encoder (for example `qrcode-generator`), pinned to an exact version, and keep `makeQrMatrix`, `qrSvg` and `downloadQrPng` working for every current caller (`QrPrintPack.tsx`, `qr-pdf.ts`, `qr-links.ts`, `src/lib/qr.test.ts`, `src/test/qr-pack.test.ts`). Plain codes use level M, logo codes use level H. Tests that pin exact modules change to decoding with `jsqr` and comparing the text. Logo rules so it still scans: logo no wider than 18 percent of the QR width, centred on a white rounded square with a small margin, quiet zone unchanged. The QR page shows the logo version when a logo exists and offers a "Use plain QR code" switch.
   - **PDF print pack.** `src/lib/qr-pdf.ts` writes the PDF by hand and has no image support. Do not add a PDF library. Embed the stored `print_jpeg` as an image object (`/Subtype /Image`, `/ColorSpace /DeviceRGB`, `/BitsPerComponent 8`, `/Filter /DCTDecode`) in the centre of the QR. Test the structure of the PDF text. If this turns out to take more than a modest amount of work, ship the PDF without the logo and list it under "Not verified" instead of adding a library.
4. **Scan proof.** In a test, render the QR modules to a pixel buffer, blank the exact centre area the logo covers, and decode it with `jsqr` (already a dependency). It must decode to the join link. Test with the longest join link a slug can produce.
5. Owner screens in live mode only. Demo mode is untouched.

## Tests
- Real database: owner uploads for own restaurant only; over 300 KB and wrong types refused; B cannot overwrite A's logo; a draft restaurant's logo is not readable by others; version changes on replace.
- Unit and scan proof as in step 4; a file that is not a real PNG or JPEG is refused; a plain QR still decodes to the join link for every URL in `src/lib/qr.test.ts`; the longest possible join link with a logo still decodes.
- Text test of the migration as AGENTS.md requires.
