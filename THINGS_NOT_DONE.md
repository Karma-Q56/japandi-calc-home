# Things not done

Work that is still open. Each item is removed once it is done.

## From D13b (branch freebuff/card-design-logo)

- Live "Your page" screen: add a live branch in `src/routes/app.page.tsx` for words, opening hours and theme. Needs a server load and save, a validated lib, and tests.
- Decide the about-text and address scope (the live schema has no about-text or address column). Either add columns in a new migration or limit the live page to tagline, suburb and hours.
- `src/routes/app.design.tsx`: redirect to the Stamp card tab in live mode.
- Scan proof test with `jsqr` for the QR code.
- `src/test/db/logo-page.db.test.ts`.
- Design controls in `src/components/patron/live/LiveStampCardTab.tsx`.
- Migration `db/migrations/0023_logo_page_dev.sql` is written but not applied. Left unapplied on purpose.
- Verify the canvas logo conversion and the logo PDF in a browser.
- Check the public logo route under workerd.

## From D14 (branch freebuff/insights-live)

- Run `src/test/db/insights.db.test.ts` against a real database. It is skipped locally; GitHub runs it.
- Check the live Insights page and CSV download in a browser, signed in as an owner. Not viewed yet.
- Top items on the Performance tab only fill once orders at the till are on and staff record items.
- Campaign links (`/app/campaigns/new?audience=...`) are sent but D15 must read the `audience` value.
