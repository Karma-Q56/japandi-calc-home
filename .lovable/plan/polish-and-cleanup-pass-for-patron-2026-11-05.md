# Polish and cleanup pass for Patron

Visual and wording polish only. No features, routes, terms, data, server, database, sign-in, payment or migration changes. Existing tests must keep passing; if a needed fix would break a test, we log it under "Needs a decision" instead of changing the test.

## What already exists (from this session)
- `scripts/shot-verify.mjs` walks every route signed in as all four roles, at 375px and 1280px, hides fixed bars, uses reduced motion, and flags console errors, sideways scroll and element overflow.
- `docs/screenshots.md` has hand-reviewed notes per screen from the last walk (4 November).
- Shared kit in `src/components/patron/dash.tsx` (PageHeader, StatCard, DataTable, EmptyState, FormField, Badge, ConfirmDialog, PreviewBanner) and tokens in `src/ui.css`.
- Link audit and route audit tests; no em dash guard test.
- No `docs/polish-log.md` yet. Tablet width (768px) has never been walked.

## Pass 1: Inventory (no app changes)
1. Extend the walker to also capture 768px (script only, not app code, not tests).
2. Run the full walk at 375, 768 and 1280. Open every shot and band by hand.
3. Create `docs/polish-log.md`: one row per screen per state, with status (not started / in progress / done), findings per problem type, plus sections for "Found but not fixed" and "Needs a decision" (structure or legal wording issues the rules say to log, not change).
4. Group findings by problem type across the whole app, so fixes land once in the shared component or style.

## Pass 2: Fix by problem type
Order by blast radius, smallest first, verifying visually after each group:
1. Typography and wording: sizes, weights, heading rhythm, plural and stray-character bugs, jargon for owners, copy that breaks the plain-English or no-em-dash rules.
2. Spacing and alignment: token gaps and paddings in `ui.css` and the dash kit rather than one-off values; header, footer and card rhythm.
3. Buttons, links, badges: one consistent look and behaviour everywhere, matching hover, focus and pressed states, clear primary vs secondary.
4. Forms: labels, helper lines, error states, placeholder contrast.
5. Empty, loading and error states: fill gaps with EmptyState or small copy fixes only (no new sections).
6. Responsive: anything that overflows or clips at 768px and 375px; tap targets on phones (min 44px); footer and nav rows.
7. Accessibility basics: visible keyboard focus, icon-only buttons with labels, alt text, reduced motion consistency.
8. Stamp and loyalty card artwork: not restyled. Only spacing and alignment around it.

## Pass 3: Verify and close
1. Rerun the full walk at all three widths; confirm 0 console errors, no sideways scroll, no clipped elements beyond the known intended ones.
2. Rerun typecheck, lint and the existing test suite unchanged; results must match the last known good state.
3. Update `docs/polish-log.md` with per-screen done status and anything left, and add a short honest entry to `Tasks completed.md` (verified / built only / not verified).
4. Reply ends with "Done" or "Not finished, next pass will cover: ..." listing what remains.

## How we handle the rules
- Same thing looks and behaves the same everywhere wins over one-off charm.
- Nothing removed or renamed. Menu labels, tab names and guest-facing terms stay exactly as they are.
- If something looks structurally wrong, it goes to "Needs a decision" in the log.
- Stamp card visuals untouched; only spacing around them.
- Consent, privacy and legal wording untouched; problems logged.

## Realistic scope for this turn
Roughly 70 stages x 3 widths is around 210 screenshots. Pass 1 plus the first two or three fix groups is achievable; the log carries the exact remainder. Next pass starts from `docs/polish-log.md`.
