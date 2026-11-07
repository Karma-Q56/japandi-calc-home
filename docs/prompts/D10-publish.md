# D10: Publish, unpublish and "show in Find" (live mode)

Wave 1 (start now) | Branch: `freebuff/live-publish` | Migration: 0014 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
A real owner can publish their restaurant so guests can join, take it offline again, and choose whether it appears in the Find directory. A draft is private all the way down, including its menu. In live mode this replaces the demo onboarding checklist with a real one.

## You own these files (touch nothing else)
- `db/migrations/0014_publish_dev.sql`
- `src/server/live-publish.ts`, `src/server/live-publish-fns.ts`, `src/server/live-publish.test.ts`
- `src/lib/live-publish.ts` (plain readiness rules and message wording) and its test
- `src/test/db/publish.db.test.ts`
- `src/components/patron/LivePublishCard.tsx` (new)
- `src/routes/app.tsx`, `src/routes/app.onboarding.tsx`
- `scripts/rls-check.mjs`

## Build
1. **Migration.** Three SECURITY DEFINER functions, each taking `p_user_id text` (same style as 0013): `publish_restaurant`, `unpublish_restaurant`, `set_restaurant_listed(p_user_id, p_listed boolean)`. Each looks up the app_user row, requires role owner or manager and a restaurant, and refuses with short codes `not_allowed`, `not_ready`, `bad_state`. Publishing needs: at least one available menu item, at least one active staff member, and a suburb. Transitions: draft or paused to active, active to paused, closed is refused (operator only, later). Listing can only be switched on while active. Write an `audit_event` row for each action. Add `restaurant_readiness(p_restaurant_id uuid)` returning which of the three conditions are met, so the screen and the SQL agree.
2. **Privacy.** Replace the `public_read` policies on `menu_section`, `menu_item` and `special` so they are readable only when `restaurant_id = app_restaurant() or app_is_operator()` or the restaurant's status is `active`. Search the migrations for any other public read policy that exposes draft data and fix it the same way.
3. **Security check script.** Update `scripts/rls-check.mjs`: restaurant B's menu, items and specials must NOT be visible to restaurant A while B is a draft, and must be visible once B is active.
4. **Server.** `getPublishState(viewer)` returns status, listed, slug and the readiness list. `publish`, `unpublish`, `setListed` call the functions. Viewer must be owner or manager. Rate limit bucket `publish`, 10 per hour per user. Map codes to plain sentences ("Add at least one menu item first.").
5. **Screen (live mode only).** `LivePublishCard` on the owner home: a status badge (Private, Live, Paused), a checklist with a tick per condition and a link to fix each (Add your menu: /app/menu, Add your team and pair the till: /app/team, Your suburb), a Publish button (primary, disabled with the plain reason while not ready), Unpublish (confirm first: "Guests will no longer see your page or be able to join."), and a switch "Show my restaurant in Find" enabled only while Live. After publishing, show the public link with a Copy button and a link to the QR page. Do the same checklist in live mode of `app.onboarding.tsx`. Demo mode keeps its current checklist untouched.

## Tests
- Real database (`publish.db.test.ts`): owner publishes own restaurant; owner of B cannot publish A; guest and staff refused; refused with `not_ready` until menu, staff and suburb exist; unpublish; listing refused while draft; another restaurant and a signed out context cannot read a draft menu; an active restaurant's menu is public; operator power is not left on.
- Unit (mocked): readiness wording, code to message mapping, rate limit refuses the 11th call.
- Text test of the migration file as AGENTS.md requires.

## Not in this phase
The Find screens (D19), plans and payments (D21), any change to loyalty, till or campaigns.
