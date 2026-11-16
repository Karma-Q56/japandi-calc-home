# D29: Test every screen, every control and every flow, and write down what you find

Round 11 (LAST, send alone, after D20 to D28 are all merged) | Branch: `freebuff/walkthrough-test` | Migration: none | Depends on: D20 to D28 merged. Run this last so it tests the finished product.

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Read AGENTS.md in full before you write code.

Karma's words, which are the whole job: "go through every single screen whether live or demo and test the event flows, if every click works, does it do the jobs it is supposed to do, does publishing stuff work, it must test absolutely everything, don't leave a single option, textbox, radio or button untouched, and create a md file for all its findings."

Karma's rules for this prompt:
- You are a tester, not a fixer. Do NOT fix product bugs in this prompt. Record every bug in the findings file and keep going. The only code you change is test code, test scripts, the workflow file and the findings docs. If a bug stops you from continuing a flow, record it, work around it in the test (for example reload the page) and say so in the findings.
- Test EVERYTHING in both modes: demo mode (fake data in the browser) and live mode (real database, real sign in). Same screens, same flows, both modes. Where a screen only exists in one mode, say so in the findings.
- Nothing may be skipped quietly. Anything you did not test goes in a "Not tested and why" list with a real reason.
- No em dashes or en dashes anywhere (`src/test/no-emdash.test.ts` covers code and docs). Plain words in the findings, because Karma reads the file himself.
- Push only to `freebuff/walkthrough-test`. Never push to main. Never touch production. Never use real phone numbers, real card details or real secrets. Never create Neon or Vercel resources. Live mode runs only against a throwaway Postgres inside the GitHub job, never against Neon.

## Goal
Three results:
1. A coverage-checked browser test run that touches every route and every control (every text box, text area, number box, date box, colour box, file box, check box, radio button, drop-down option, toggle, button, link, tab, dialog and menu item) on every screen, in demo mode and in live mode, with several values in each box (valid, empty, too long, strange characters).
2. Scripted event flows that follow a real person from start to finish (a guest joining, a staff member stamping, an owner publishing, an operator approving, and so on) and check that each one does its job, including what the other side then sees.
3. One findings file, `docs/qa/walkthrough-findings.md`, that Karma can read from top to bottom and that lists every control tested with what was done, what was expected, what happened, the result and how serious it is.

## You own these files (touch nothing else)
- `tests/walkthrough/**` (all new)
- `playwright.walkthrough.config.ts` (new)
- `scripts/walkthrough-inventory.mjs`, `scripts/walkthrough-report.mjs`, `scripts/walkthrough-live-seed.mjs` (new)
- `.github/workflows/walkthrough.yml` (new)
- `docs/qa/**` (new: `walkthrough-findings.md`, `walkthrough-inventory.md`, `known-bugs.json`, `README.md`)
- `package.json`: add only the scripts `test:walkthrough` and `walkthrough:report`
Do not edit anything under `src/`, `db/` or the existing `tests/e2e/`. If a test needs a stable hook (for example a `data-testid`) that does not exist, do NOT add it to the product. Find the element by role, label, text or CSS instead, and list the missing hook in the findings under "Hooks that would help".

## Read first
`playwright.config.ts`, `tests/e2e/demo-no-scroll.spec.ts`, `scripts/audit-pages.mjs`, `scripts/audit-flows.mjs`, `scripts/journey.mjs` (older demo walk-through scripts you can borrow from), `src/routes/dev.roles.tsx` (the demo sign in: `/dev/roles?role=owner&restaurant=<id>&to=/app` and the roles guest, staff, owner, manager, operator), `src/lib/demo-signin.ts`, `src/server/db/mode.ts` (live mode is `DATA_MODE=live`), `docs/auth-setup.md` (owners, managers and operators are linked by hand in the `app_user` table by email; a new sign up is a guest), `src/routeTree.gen.ts` (every route), `.dev.vars.example`, `.env.example`, `.github/workflows/ci.yml`, `docs/demo-script.md`, `docs/prompts/README.md`, AGENTS.md.

## Part A: the inventory (what exists)

1. `scripts/walkthrough-inventory.mjs`: starts from `src/routeTree.gen.ts` (parse the route paths; add dynamic routes with real ids such as `/r/daily-grind`, `/app/customers/<id>`, `/app/campaigns/<id>`, `/ops/restaurants/<id>`), opens every route in a real browser for every role that can reach it (visitor, guest, staff, owner, manager, operator) at widths 360 and 1280, and writes `docs/qa/walkthrough-inventory.md` and a machine file `tests/walkthrough/inventory.json`. For every interactive element record: route, role, mode, element kind (text, email, tel, number, password, search, url, date, time, color, range, file, textarea, checkbox, radio, select with its list of options, toggle, button, link, tab, summary, dialog trigger), its accessible name or label, its `name` or `id`, whether it is inside a form, and a stable key (route plus role plus kind plus name plus the index of the same name).
2. Also expand things that only appear after a click: every tab, every "Add" or "New" button (open it and inventory the form that appears), every dialog, every drop-down menu, every row action. The inventory step may click safe openers (tabs, "Add", "New", "Edit", "More") to reveal controls, never destructive ones.
3. The inventory is the contract: Part B must touch every key in it.

## Part B: the exhaustive sweep (what each control does)

`tests/walkthrough/sweep.spec.ts` reads `tests/walkthrough/inventory.json` and runs one test per screen per role per mode (so a failure points at one screen). For each control, do ALL of the actions for its kind, in this order, and record the result of each:

- Text, email, tel, url, search, password boxes: type a valid value; clear it and leave the box empty and submit; type a value longer than the limit shown (or 600 characters if no limit is shown); type text with special characters (`<b>x</b>`, `"quotes"`, `'single'`, `O'Brien & Sons`, an emoji, a line of Zulu and Afrikaans letters such as `Sipho Mkhize ë ï ô`, leading and trailing spaces); a phone box also gets a South African number in the formats `082 123 4567`, `+27821234567`, `0821234567`, a too short number and letters. Check the screen answers in plain words (no raw codes such as `invalid_value`, no `undefined`, no `[object Object]`, no stack trace) and that the special text shows as plain text and is never run as HTML.
- Number boxes: valid, zero, negative, a decimal, a very large number (999999999), empty, letters (the browser may block them: record that).
- Date and time boxes: today, yesterday, a date far in the future, a date far in the past, empty, an end before a start.
- Colour boxes and hex boxes: a valid colour, an unreadable pair (for example text `#cccccc` on `#ffffff`), invalid hex.
- Range sliders: minimum, maximum, middle.
- Check boxes and toggles: switch on, switch off, and on again. Record what changed on screen and what changed after saving and reloading.
- Radio buttons: choose each option in turn. Drop-downs: choose EVERY option in the list, one by one.
- File boxes: a small valid PNG, a valid JPEG, a text file renamed `.png`, a file over the size limit shown (or 6 MB), and no file. A logo, a menu photo and a feedback screenshot are examples.
- Buttons: click each one. If it opens a confirm dialog, test both the confirm and the cancel path. If it is disabled, record why (for example "disabled until the form is valid" is fine) and check it enables when it should. A button must do something visible: a message, a page change, new data, or a closed dialog. A button that does nothing is a failure.
- Links: follow every link on the screen (internal and external; do not follow external links, just check the `href` is not empty, starts with `https://` or `mailto:` or `tel:` and has `rel="noopener"` when it opens a new tab). Internal links must not answer 404 or a blank page.
- Tabs and menus: open every tab and every menu item, check the heading changes and the page does not scroll sideways.
- Forms as a whole: submit empty (every required box must complain in words), submit valid, submit twice quickly (no double records), submit and press the back button, submit and reload.

After EVERY action also check and record (these are the "does it do its job" checks):
1. No uncaught page error and no `console.error`.
2. No network call answered 5xx. Any 4xx that is not an expected refusal is recorded.
3. No horizontal page scroll at 360 and 1280.
4. No visible `undefined`, `null`, `NaN`, `[object Object]`, `Invalid Date`, `{{`, a raw snake_case code (`/\b[a-z]+(_[a-z]+)+\b/` inside an alert or status line), a raw stack trace, or a currency shown without `R`.
5. Buttons never change their label to Saving or Saved.
6. The change really happened: after any save or action, reload the page and check the new value is still there (and that it is NOT there when the action was refused).
7. The other side sees it: where a change should be visible to someone else, check it from their side (see Part C).

Coverage gate: at the end of the run `scripts/walkthrough-report.mjs` compares the keys touched with `inventory.json`. It prints how many controls exist, how many were touched, and lists every untouched key. The run FAILS if any control was neither touched nor listed in `docs/qa/not-tested.json` with a reason. Reasons must be real (for example "needs a real phone to receive an SMS", "opens the PayFast hosted page, which this test must not use"), not "not needed".

Safe handling of destructive and money controls:
- Demo mode: the data is a local copy in the browser. Click everything, including delete and reset. Use a fresh browser context per screen so one screen cannot spoil the next, and reload between destructive clicks inside a screen.
- Live mode: only the throwaway database. Click everything, including delete. The SMS and payment parts use the fake providers (`fakeSmsProvider`, the PayFast sandbox values from `.env.example`). The PayFast hosted page itself is NOT opened (record that the button redirects to the right address, with the right amount, and stop there). No real card, no real phone, no real secrets.

## Part C: the event flows (does it do its job)

`tests/walkthrough/flows/*.spec.ts`, one file per flow, each flow runs in demo mode AND live mode (a shared helper does the sign in for each mode). Every step has a plain-words title, an expected result and an assertion. Every flow ends by checking what the OTHER side sees. If a step is impossible in one mode, the test says so with `test.skip(condition, "reason")` and the reason goes to the findings.

1. **Guest joins.** Visitor opens a restaurant page, taps Join, fills name and phone (valid, then each invalid shape), consent boxes (SMS and push, each on and off), submits, sees the card with 0 stamps; opens the same page again and sees the card still there; joins the same restaurant a second time with the same phone (no duplicate); joins a second restaurant (a second card).
2. **Staff stamps.** Staff pair the till (pairing code from Team), sign in with PIN (wrong PIN, five wrong PINs and the lockout message, right PIN), find the guest by scan code and by member code, add a stamp, add a second stamp right away (too soon message), reach the reward, redeem it, undo the redeem within the time limit, try to undo after the limit, use an offer code, record an order with menu items and a bill amount, sign out. The guest card shows the right counts after each step and the owner's Home numbers move.
3. **Guest side after stamps.** Card shows stamps and reward, spin the wheel (when enabled and earned), see the prize, the weekly prize limit message when the prize ran out, referral link, birthday field, tier badge, challenges progress, specials list, "Try this dish" challenge.
4. **Owner onboarding and Settings.** New owner signs in, finishes onboarding, every Settings tab saved with valid values and refused with invalid ones, each saved value is still there after reload and visible where guests see it (page, card, receipts).
5. **Owner publishes and unpublishes.** Edit the page words, hours, address, suburb and venue type; publish; open the public page as a visitor and check everything shows; check it appears in Find with the right suburb and type; unpublish; check the public page and Find no longer show it and the guest card still works for existing guests; publish again. Also: change the page address in the operator console and check the old address redirects.
6. **Loyalty tools.** For each tab (stamp card and design, tiers, bonus rules, wheel, challenges, referrals, specials, dish challenge): change every setting, publish it, and check the guest side shows exactly that. Include the card colours (readable and unreadable pair), logo upload, QR with logo.
7. **Menu.** Add a section, add items with and without price and photo, mark one unavailable, rename, reorder, delete; the till order screen and the guest menu show the changes.
8. **Customers and lists.** Search, every filter, open a profile, add a note, add to a list, remove, create a saved list, open the composer from "Send to this list" with that list chosen, withdraw SMS consent, reveal phone number (audit line written).
9. **Campaigns.** Create one for each audience type (everyone, new, lapsed, close to reward, weekday, birthday month, saved list), check the recipient count and cost, send for approval, cancel one, schedule one; operator approves one and rejects one with a reason; the owner sees the status change; the outbox shows the messages with the guest phone masked on the operator side; low credit warning; credit top-up request and operator confirm; STOP reply handling in demo.
10. **Billing.** Plans page, change plan (up and down, with the branch limit message), monthly payment block, payment start for each plan (check the redirect address and amount only), simulated "payment received" and "payment failed" in the sandbox way the code supports, grace period banner and campaign pause (D25).
11. **Branches.** Add a second branch, make it the main one, assign a staff member to a branch, stamp at each branch, see the Insights branch filter, deactivate a branch, hit the plan limit message.
12. **Team.** Add staff, reset PIN, deactivate, reactivate, pairing code, unpair a till.
13. **Operator.** Restaurants list and search, create a restaurant, restaurant detail, status changes, look and QR pages, credit pending list, invoices, void an invoice, campaigns approvals, enquiry inbox (set each status, notes), feedback (set each status, show screenshot), ideas, outbox, change a page address, refund record.
14. **Public pages and forms.** Every marketing page loads and every link on it works; the Talk to us form (valid, invalid), the "add my restaurant" form, the feedback form (with and without a screenshot), the idea form, Find (every filter, every sort, empty result), login (wrong password, right password, rate limit message after many tries), sign up (every error), forgot and reset password (the error pages `link-expired` and `session-expired` too), `/offline`, `/maintenance`, a made-up address (404 page), sign out from every area.
15. **Guest account area `/me`.** Cards list, a card, settings (name, phone, consent, push on and off), delete my data request, sign out.

Every flow records, per step, a line for the findings: flow, step, mode, expected, result, evidence (screenshot path on failure and a short error message).

## Part D: where it runs

- Config: `playwright.walkthrough.config.ts` with two projects, `demo` (uses the preview server like `playwright.config.ts`) and `live` (same server started with `DATA_MODE=live` and the throwaway database). Use 4 workers, 90 second test timeout, `trace: "retain-on-failure"`, screenshots only on failure, and a custom reporter that writes `test-results/walkthrough.json`. Script `pnpm test:walkthrough` runs both.
- Workflow `.github/workflows/walkthrough.yml`: runs on `workflow_dispatch` and on push to the branch `freebuff/walkthrough-test` only (never on every push to every branch). It has the same Postgres service and migration steps as `ci.yml`, applies `scripts/walkthrough-live-seed.mjs` for live mode, builds, runs `pnpm test:walkthrough`, runs `pnpm walkthrough:report`, and uploads `docs/qa/` and `test-results/` as artifacts even when tests fail.
- Live seed (`scripts/walkthrough-live-seed.mjs`): inserts one restaurant with menu, tiers, specials, 12 guests and some stamps; and `app_user` rows by email for one owner, one manager, one staff member and one operator, so each can then sign up through the real sign up page with the same email and be linked (see `docs/auth-setup.md` and `ensureViewer`). Passwords are random and generated inside the job (never committed, never printed). Study how `scripts/seed-dev.mjs` does it but never run that script and never use its dev branch guards as a way into Neon: this seed runs only against `127.0.0.1` and refuses any other host.
- If pushing the workflow file is refused because the token has no permission for workflow files, remove the workflow file from the commit, save the exact YAML in `docs/qa/walkthrough.workflow.yml.txt`, push everything else, and say so in the first lines of the handoff. Claude will add the workflow. Do the demo part locally if you can run a browser, and report which parts you could not run.
- If live mode cannot be made to work in the job after 3 pushes (for example the Worker preview does not pick up the database settings), stop trying, write exactly what blocked it in the findings ("Live mode: not run, because ..."), and finish the demo part completely. Do not spend more than 3 pushes on this. The live part is then a follow-up.
- Keep `pnpm typecheck`, `pnpm lint` (zero warnings after D28) and `pnpm test` green. The normal `pnpm test:e2e` and the normal CI must not become slower: the walkthrough lives in its own folder, config and workflow.

## Part E: how bugs are recorded

- `docs/qa/known-bugs.json`: a list of `{ "id": "BUG-001", "key": "<inventory key or flow step>", "mode": "demo|live|both", "severity": "blocker|major|minor|cosmetic", "summary": "plain words" }`. The sweep and the flows mark a test or step listed here with `test.fail(true, id + " " + summary)` (Playwright's expected failure) so the run stays green while the bug is open, and turns red when the bug is fixed and the entry must be removed. A NEW failure that is not in this file is a real red failure on the first run: record it in the file after you have looked at it and confirmed it is a bug in the product and not in your test (re-run it once, read the screenshot). Do not hide a flaky test: fix the test (wait for the right thing) rather than listing it as a product bug.
- Severity words: blocker (a main job cannot be done, data lost or leaked, wrong money), major (a feature does not do its job but there is a way round), minor (wrong wording, wrong number in a corner, layout problem that does not block), cosmetic (looks off).
- Anything that could leak private data (full phone numbers where they should be masked, another restaurant's data, the private feedback note shown to the sender) is a blocker and goes at the very top of the findings.

## Part F: the findings file (the thing Karma reads)

`scripts/walkthrough-report.mjs` builds `docs/qa/walkthrough-findings.md` from the JSON results, the inventory and `known-bugs.json`, and you then add the short "In plain words" section by hand at the top. The file has this shape:

1. **Header.** Date, branch, commit, modes run (demo, live, or "live not run, because ..."), numbers: screens, controls found, controls touched, flows, steps, passes, failures, not tested.
2. **In plain words.** Ten lines at most: how healthy it is, the five most important problems, what to do first.
3. **Failures, worst first.** A table: ID, severity, mode, screen, what you did, what you expected, what happened, evidence (screenshot file name), and the key to re-run it.
4. **Event flows.** One table per flow (steps with expected, result, mode), with what the other side saw.
5. **Screen by screen.** One section per screen (route and role), each with a table: Control (its label), Kind, What I did (every value or option tried), Expected, Result (Pass, Fail or Not tested), Evidence, Severity. Every control from the inventory appears in exactly one row group. Demo and live results sit side by side (two result columns) so Karma sees at once what differs between modes.
6. **Not tested and why.** Every item from `docs/qa/not-tested.json` with its reason.
7. **Hooks that would help.** Controls that were hard to find without a stable test id.
8. **How to run this again.** The two commands and the workflow name.

The file must be complete even when tests fail: the report script reads whatever results exist and marks missing ones "Not tested". It must be readable: long evidence goes in a file next to it, not in the table.

## Tests for your own test code
- Unit tests for the report script (a small fake results file produces the right tables, a failed row, a known-bug row, an untouched control, a not-tested reason) and for the inventory key function (stable keys, same name twice gets index 2). Put them in `tests/walkthrough/report.test.ts` and make sure `pnpm test` picks them up (or run them in the walkthrough config and say which).
- Self-check: the coverage gate fails when you delete one control from the touched list in a fake run.

## Not in this prompt
Fixing any bug found, adding test ids to the product, load testing, security testing beyond the privacy leaks in Part E, testing the real SMS provider, real PayFast or real email (Karma's accounts are not connected yet), the marketing redesign.

## Handoff (send these lines)
First lines: branch, last commit, the GitHub run link for the walkthrough workflow (or why it could not be added), and the numbers from the findings header (screens, controls found, touched, not tested, flows, steps, passes, failures by severity). Then: the five worst findings in one line each, whether live mode ran, the full path of the findings file, anything unfinished, anything that surprised you.
