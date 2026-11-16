# D27: Small fixes (campaign links, "visits today" quirk, demo pill, dead code)

Round 9 (send with D26) | Branch: `freebuff/small-fixes` | Migration: none | Depends on: nothing new.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's rules for this prompt:
- Fix live AND demo wherever both have the screen. Say in the handoff, per item, "live done / demo done" or why one does not apply.
- Be thorough: every fix gets a test that fails before the fix and passes after.
- No em dashes or en dashes anywhere. Plain words for owners.
- Push only to `freebuff/small-fixes`. Never push to main. Never touch production.

## You own these files (touch nothing else)
- `src/components/patron/live/LiveInsights.tsx`
- `src/routes/app.campaigns.new.tsx` (the route and the live composer inside it; the demo `ComposerPage` is in this file or next to it, read it first)
- `src/routes/app.lists.tsx`, `src/routes/app.customers.tsx` (only the links that open the composer), `src/routes/app.customers.$customerId.tsx` (only the link that opens the composer with `name` and `body`)
- `src/components/patron/DemoHome.tsx`, `src/lib/home-metrics.ts`, `src/lib/home-metrics.test.ts`, `src/lib/live-overview.ts` (only if it has the same percent logic)
- `src/components/patron/DemoControlBar.tsx` and the CSS rules it uses (search `src/ui.css` and `src/styles.css` for its class names)
- `src/server/fns/` (dead code, see item 4)
- New tests: `src/test/campaign-links.test.ts`, `tests/e2e/demo-small-fixes.spec.ts`

## Item 1: opening the campaign composer with the right audience

Three links lose what the owner meant to send to.
1. `src/components/patron/live/LiveInsights.tsx` line 52: `campaignHref` builds `/app/campaigns/new?audience=<value>`. The route `/app/campaigns/new` only understands the search keys `segment`, `weekday`, `listId`, `body` and `name` (see its `validateSearch`). The key `audience` is thrown away, so every Insights button opens a composer with the default audience. Change the link to use `segment` (and `weekday` where the block is a weekday block). Check every call of `campaignHref` and use the exact segment names from `AUDIENCE_TYPES` in `src/lib/live-campaigns.ts` (everyone, new, lapsed30, close_to_reward, weekday, birthday_month, saved_list).
2. `src/routes/app.lists.tsx`: the "Send to this list" buttons (two of them, one for live lists and one for demo lists, near lines 124 and 232) link to `/app/campaigns/new` with nothing. Make each one link to `/app/campaigns/new?segment=saved_list&listId=<that list's id>`. The "Send a campaign" header button stays as it is.
3. `src/routes/app.campaigns.new.tsx`: the live composer (`LiveCampaignComposer`) only receives `audience` and `weekday` from the search. It ignores `listId`, `name` and `body`. Make it use them: when `listId` is present and `segment` is `saved_list` (or `segment` is missing), start with the saved list audience (`{ type: "saved_list", listId }`, which `src/server/live-campaign-create.ts` already supports); when `name` or `body` are present, prefill the campaign name and the message text (the route already cuts them to 80 and 600 characters). A `listId` that is not a UUID is ignored (the zod rule on the server expects a UUID). The demo composer already reads `listId`; check that it also reads `name` and `body`, and add that if it does not.
4. In the live composer show the chosen list's name in the audience step ("Your list: Regulars") when a list was passed. Load the list names with the server function the Lists page uses (`src/server/live-lists.ts`).

Tests (`src/test/campaign-links.test.ts` and component tests): every `campaignHref` value is a string the route's `validateSearch` accepts and returns the intended `segment`; the lists page links contain `segment=saved_list&listId=`; the composer starts with the saved list audience when given a valid list id and ignores a bad one; name and body prefill and are cut at 80 and 600 characters. Export the pure helper that builds these links (for example `composerHref({ segment, weekday, listId, name, body })` in `src/lib/live-campaigns.ts`) and use it everywhere, so the links cannot drift again.

## Item 2: "Visits today" can show minus 100 percent

`DemoHome.tsx` (used for both live and demo Home) compares today's visits so far with the WHOLE of yesterday (`change(today.visits, yesterday.visits)` using `percentChange` in `src/lib/home-metrics.ts`). At 8 in the morning that reads "-100% vs yesterday" or "-85%" even on a normal day. Fix the comparison:
- Compare today so far with yesterday UP TO THE SAME CLOCK TIME. Add a pure function in `src/lib/home-metrics.ts`: `countUpTo(timestamps: string[], dayStart: Date, atTime: Date): number`, and use it for visits, guests and new members. The rule: count items from `dayStart` up to `atTime` (the same offset into the day).
- Wording: if yesterday up to now is 0 and today is 0 say "Nothing yet today"; if yesterday up to now is 0 and today is more, say "More than yesterday so far" (never a percent); otherwise "+12% vs yesterday so far" or "-8% vs yesterday so far". Never show a percent below -100 or a percent for a zero base.
- Do the same in `src/lib/live-overview.ts` if it computes any "vs yesterday" text, and for any other place `percentChange(` is used with a partial day against a whole day (search the repo).
- Tests (`src/lib/home-metrics.test.ts`): fixed clock values (no dependence on today's date or the hour); morning with no visits and a busy yesterday; evening equal to yesterday; zero base; a day boundary at midnight in Africa/Johannesburg (UTC+2).

## Item 3: the demo control dot sits over numbers on phones

`src/components/patron/DemoControlBar.tsx` is the small floating pill or dot used in demo mode. On phone width the collapsed dot can sit on top of a number or a button. Fix: keep it collapsed to a small dot that never overlaps page content: add bottom padding to the page body in demo mode equal to the dot's size plus 16px (use a `body` class that the component adds only in demo mode), or move the dot to the free corner away from the primary buttons. Check at widths 360, 390, 768 and 1280 with the existing Playwright `design-kit.spec.ts` approach (open `/app`, `/app/customers`, `/app/insights`, `/stamp`) and assert that the dot's bounding box does not intersect any `button`, `a` or `[class*="stat"]` element's bounding box. Add that check as a new browser test (`tests/e2e/demo-small-fixes.spec.ts`). The pill must still let the user switch roles.

## Item 4: dead code

`src/server/fns/` (`auth.ts`, `index.ts`, `lead.ts`, `member.ts`, `restaurant.ts`, `stamp.ts`) looks like early scaffolding: `index.ts` even exports `undo` as "Not implemented", and `stamp.ts` has an old `redeem` and `undo`. Prove it is unused: search the whole repo (including tests, route files and config) for `server/fns`, `from "./fns`, `fns/stamp`, `fns/auth`, `fns/lead`, `fns/member`, `fns/restaurant`. If NOTHING imports the folder, delete the whole folder. If something does import a file, keep that file and delete only the unused exports. Then run `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test`. Write in the handoff exactly what you deleted and the proof (the searches you ran).

## Not in this prompt
Lint warning cleanup (D28), design changes (D28), new features.

## Handoff (send these lines)
Branch and last commit, test counts, per item "live done / demo done / not applicable", the exact list of deleted files, anything unfinished, anything that surprised you.
