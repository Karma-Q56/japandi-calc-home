# Screens, buttons and copy for Patron

Contents: live and demo, the shared kit, buttons, states, copy, sizes.

## Live and demo

- Demo mode is the sales tool and is the default. It keeps working exactly as it does now. Never change demo behaviour unless your prompt says so.
- A route decides by mode. The pattern is in `src/routes/app.menu.tsx`: the loader returns `{ mode, live }`, and the component renders the live version when `mode === "live"`, otherwise the existing demo version.
- A live screen shows real data from the database or a plain "not ready yet" message. It never shows sample numbers to a real owner.
- Server code for the live version never trusts the browser for the restaurant, role, plan, status or credit. The signed in user comes from the session on the server.

## The shared kit

- Build owner screens from `src/components/patron/dash.tsx` (PageHeader, StatCard, DataTable, EmptyState, FormField, Badge, ConfirmDialog, PreviewBanner). Add no new colours or one-off styles.
- One tab bar per section. Loyalty, Challenges and Referrals share `LoyaltyTabs`.
- One primary action per page. The most important button is `builder-primary`. Everything else is `builder-secondary`.

## Buttons must look like buttons

Karma's rule: a button looks like a button, not like a message or an info box.
- Use the existing button classes (`builder-primary`, `builder-secondary`, and the kit button variants). Do not make a button by styling a div, a badge or a paragraph.
- A button has a clear shape (fill or border), at least 44 px tap height, a pointer cursor, a visible hover change, a visible pressed change and a visible keyboard focus ring.
- Do not use a button to display information, and do not make information (a stat, a notice, a tag) look like a button. Information has no border radius pill and no hover.
- Do not replace a button's label with status text such as "Saving..." or "Saved". Keep the label. Show the result with the normal notice or toast pattern already in the kit, and disable the button while the request runs.
- A destructive action (delete, stop, cancel) asks first with `ConfirmDialog`.

## States

Every screen handles four states in plain words: loading, empty (say what to do next), error (say what happened and what to try), and success (a short notice). Never show a raw error message or an id to an owner.

## Copy

- Plain words a café owner understands the first time. Short sentences. Rands as `R150`, phone numbers in South African form, places in Gauteng as examples.
- No em dashes or en dashes anywhere, including comments and docs. Use a comma, a colon or a full stop.
- Say "guests" for diners and "your restaurant" for the business. Say "the till" for the staff screen.
- Name things the way the existing screens do. Do not rename or move an existing screen or label unless the prompt says so.

## Sizes and checks

- Phone first. The page must not scroll sideways at 375 px, and must look right at 768 px and 1280 px.
- Tap targets 44 px or larger, including links that sit in text on phone-only screens.
- If you add a route, add it to the owner navigation only if the prompt says so.
